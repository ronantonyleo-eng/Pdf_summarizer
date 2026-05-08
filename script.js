// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const emptyState = document.getElementById('emptyState');
const progressBarFill = document.getElementById('progressBarFill');
const progressPercentage = document.getElementById('progressPercentage');
const summaryContent = document.getElementById('summaryContent');
const structuredContent = document.getElementById('structuredContent');
const keypointsContent = document.getElementById('keypointsContent');
const summaryStats = document.getElementById('summaryStats');
const wordCountSpan = document.getElementById('wordCount');
const charCountSpan = document.getElementById('charCount');
const copyResultBtn = document.getElementById('copyResultBtn');
const downloadResultBtn = document.getElementById('downloadResultBtn');

// Progress steps
const steps = {
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step4: document.getElementById('step4')
};

let currentFile = null;
let currentSummary = '';

// File upload handlers
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#667eea';
    uploadZone.style.background = '#f0f0ff';
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#ddd';
    uploadZone.style.background = '#fafafa';
});
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#ddd';
    uploadZone.style.background = '#fafafa';
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) processFile(e.target.files[0]);
});

// Update progress
function updateProgress(percent, stepName, completed = false) {
    progressBarFill.style.width = `${percent}%`;
    progressPercentage.textContent = `${percent}%`;
    
    if (stepName && steps[stepName]) {
        if (completed) {
            steps[stepName].classList.add('completed');
            steps[stepName].classList.remove('active');
        } else {
            steps[stepName].classList.add('active');
        }
    }
}

// Process file (main function)
async function processFile(file) {
    currentFile = file;
    
    // Reset UI
    uploadSection.style.display = 'none';
    emptyState.style.display = 'none';
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';
    
    // Reset progress steps
    Object.values(steps).forEach(step => {
        step.classList.remove('active', 'completed');
    });
    
    try {
        // Step 1: Computing tokens
        updateProgress(10, 'step1');
        await delay(500);
        
        let extractedText = '';
        const fileType = file.type;
        
        // Extract text based on file type
        if (fileType === 'application/pdf') {
            extractedText = await extractPDFText(file);
        } else if (fileType === 'text/plain') {
            extractedText = await extractTXTText(file);
        } else {
            throw new Error('Unsupported file type. Please upload PDF or TXT files.');
        }
        
        updateProgress(30, 'step1', true);
        
        // Step 2: Figuring out hierarchies
        updateProgress(40, 'step2');
        await delay(500);
        
        const structure = analyzeDocumentStructure(extractedText);
        updateProgress(60, 'step2', true);
        
        // Step 3: Selecting insightful information
        updateProgress(70, 'step3');
        await delay(500);
        
        const summary = generateAISummary(extractedText, structure);
        updateProgress(85, 'step3', true);
        
        // Step 4: Formatting results
        updateProgress(90, 'step4');
        await delay(500);
        
        displayResults(summary, structure, extractedText);
        updateProgress(100, 'step4', true);
        
        // Show results
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultsSection.style.display = 'block';
        }, 500);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error processing file: ' + error.message);
        resetToUpload();
    }
}

// Extract text from PDF
async function extractPDFText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    
    if (fullText.trim().length === 0) {
        // Fallback to OCR if no text found
        return await performOCR(pdf);
    }
    
    return fullText;
}

// OCR for scanned PDFs
async function performOCR(pdf) {
    let ocrText = '';
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const { data: { text } } = await worker.recognize(canvas);
        ocrText += text + '\n';
        canvas.remove();
    }
    
    await worker.terminate();
    return ocrText;
}

// Extract text from TXT file
async function extractTXTText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Analyze document structure
function analyzeDocumentStructure(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const sections = [];
    let currentSection = null;
    
    for (const line of lines) {
        const trimmed = line.trim();
        const isHeading = trimmed.length < 100 && 
                         (trimmed === trimmed.toUpperCase() ||
                          trimmed.match(/^[0-9]+\./) ||
                          trimmed.match(/^[A-Z][a-z]+:/));
        
        if (isHeading) {
            if (currentSection) sections.push(currentSection);
            currentSection = {
                title: trimmed,
                content: []
            };
        } else if (currentSection) {
            currentSection.content.push(trimmed);
        }
    }
    
    if (currentSection) sections.push(currentSection);
    
    return { sections, totalLines: lines.length };
}

// Generate AI-quality summary
function generateAISummary(text, structure) {
    const words = text.split(/\s+/);
    const originalLength = words.length;
    const targetLength = Math.min(Math.max(Math.floor(originalLength * 0.3), 200), 1000);
    
    // Extract key sentences using TF-IDF like algorithm
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const wordFreq = {};
    
    words.forEach(word => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        if (cleanWord.length > 3) {
            wordFreq[cleanWord] = (wordFreq[cleanWord] || 0) + 1;
        }
    });
    
    const sentenceScores = sentences.map(sentence => {
        let score = 0;
        const sentenceWords = sentence.toLowerCase().split(/\s+/);
        sentenceWords.forEach(word => {
            const cleanWord = word.replace(/[^\w]/g, '');
            if (wordFreq[cleanWord]) score += wordFreq[cleanWord];
        });
        score /= sentenceWords.length;
        
        // Boost first/last sentences
        const index = sentences.indexOf(sentence);
        if (index === 0) score *= 1.5;
        if (index === sentences.length - 1) score *= 1.3;
        
        return { sentence, score };
    });
    
    sentenceScores.sort((a, b) => b.score - a.score);
    const topSentences = sentenceScores.slice(0, Math.ceil(targetLength / 20));
    topSentences.sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));
    
    let summary = topSentences.map(s => s.sentence).join(' ');
    
    // Add section headers if available
    if (structure.sections.length > 0) {
        let structuredSummary = '';
        for (const section of structure.sections.slice(0, 5)) {
            if (section.title && section.title.length < 60) {
                structuredSummary += `\n\n## ${section.title}\n`;
                const sectionSentences = section.content.join('. ').match(/[^.!?]+[.!?]+/g) || [];
                const topSectionSentences = sectionSentences.slice(0, 2);
                structuredSummary += topSectionSentences.join(' ');
            }
        }
        if (structuredSummary) summary = structuredSummary;
    }
    
    return summary;
}

// Display results
function displayResults(summary, structure, fullText) {
    currentSummary = summary;
    
    // Display summary
    const formattedSummary = summary.split('\n').map(line => {
        if (line.startsWith('##')) {
            return `<h3>${line.replace('##', '📌')}</h3>`;
        } else if (line.trim()) {
            return `<p>${line}</p>`;
        }
        return line;
    }).join('');
    
    summaryContent.innerHTML = formattedSummary || '<p>No summary generated. Please try a different file.</p>';
    
    // Display structured view
    let structuredHtml = '<ul>';
    for (const section of structure.sections.slice(0, 8)) {
        structuredHtml += `<li><strong>${escapeHtml(section.title)}</strong><br>`;
        const preview = section.content.join(' ').slice(0, 150);
        structuredHtml += `${escapeHtml(preview)}...</li>`;
    }
    structuredHtml += '</ul>';
    structuredContent.innerHTML = structuredHtml;
    
    // Display key points
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [];
    const keyPoints = sentences.filter(s => {
        const lower = s.toLowerCase();
        return lower.includes('important') || 
               lower.includes('key') || 
               lower.includes('essential') ||
               lower.includes('note that') ||
               s.length < 120;
    }).slice(0, 10);
    
    let keypointsHtml = '<ul>';
    keyPoints.forEach(point => {
        keypointsHtml += `<li>${escapeHtml(point.trim())}</li>`;
    });
    keypointsHtml += '</ul>';
    keypointsContent.innerHTML = keypointsHtml;
    
    // Update stats
    const wordCount = summary.split(/\s+/).length;
    const charCount = summary.length;
    const originalWords = fullText.split(/\s+/).length;
    const reduction = Math.round((1 - wordCount / originalWords) * 100);
    
    summaryStats.innerHTML = `
        📊 Summary: ${wordCount} words | 
        ✨ ${reduction}% shorter than original | 
        📝 ${structure.sections.length} sections detected
    `;
    
    wordCountSpan.textContent = `${wordCount} words`;
    charCountSpan.textContent = `${charCount} characters`;
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}Tab`).classList.add('active');
    });
});

// Copy results
copyResultBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(currentSummary);
        copyResultBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            copyResultBtn.textContent = '📋 Copy';
        }, 2000);
    } catch (err) {
        alert('Failed to copy text');
    }
});

// Download results
downloadResultBtn.addEventListener('click', () => {
    const blob = new Blob([currentSummary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary_${currentFile.name.replace(/\.[^/.]+$/, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// Cloud integration placeholders
document.getElementById('driveBtn').addEventListener('click', () => {
    alert('Google Drive integration coming soon!');
});

document.getElementById('dropboxBtn').addEventListener('click', () => {
    alert('Dropbox integration coming soon!');
});

document.getElementById('upgradeBtn').addEventListener('click', () => {
    alert('Premium features coming soon! Unlimited summaries, higher quality AI, and more!');
});

// Reset to upload view
function resetToUpload() {
    uploadSection.style.display = 'block';
    emptyState.style.display = 'block';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
}

// Helper functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Paste support
document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type === 'application/pdf' || item.type === 'text/plain') {
            const file = item.getAsFile();
            if (file) processFile(file);
            break;
        }
    }
});
