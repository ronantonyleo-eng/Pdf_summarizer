// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const pdfInput = document.getElementById('pdfInput');
const loading = document.getElementById('loading');
const summaryContainer = document.getElementById('summaryContainer');
const summaryContent = document.getElementById('summaryContent');
const summaryStats = document.getElementById('summaryStats');
const copyBtn = document.getElementById('copyBtn');

// File upload handlers
uploadArea.addEventListener('click', () => pdfInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = '#f0f0ff';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#ddd';
    uploadArea.style.background = '#fafafa';
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#ddd';
    uploadArea.style.background = '#fafafa';
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        processPDF(file);
    } else {
        alert('Please upload a valid PDF file');
    }
});
pdfInput.addEventListener('change', (e) => {
    if (e.target.files[0]) processPDF(e.target.files[0]);
});

// Main PDF Processing Function
async function processPDF(file) {
    // Show loading
    loading.style.display = 'block';
    summaryContainer.style.display = 'none';
    uploadArea.style.display = 'none';
    
    try {
        // Read PDF
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        
        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }
        
        // Clean and prepare text
        fullText = cleanText(fullText);
        
        // Generate summary
        const summary = generateSmartSummary(fullText);
        
        // Calculate stats
        const originalWords = fullText.split(/\s+/).length;
        const summaryWords = summary.split(/\s+/).length;
        const reduction = Math.round((1 - summaryWords / originalWords) * 100);
        
        // Display results
        summaryStats.innerHTML = `
            📊 Original: ${originalWords} words | 
            ✨ Summary: ${summaryWords} words | 
            🎯 ${reduction}% shorter
        `;
        
        summaryContent.innerHTML = formatSummary(summary);
        summaryContainer.style.display = 'block';
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error processing PDF. Please make sure it\'s a valid text-based PDF (not scanned).');
    } finally {
        loading.style.display = 'none';
        uploadArea.style.display = 'flex';
    }
}

// Clean extracted text
function cleanText(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?;:()\-]/g, '')
        .trim();
}

// Smart Summarization Algorithm (Extractive)
function generateSmartSummary(text) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    if (sentences.length < 5) return text;
    
    // Calculate word frequencies
    const wordFreq = {};
    const words = text.toLowerCase().split(/\s+/);
    
    // Remove common stop words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'for', 'on', 'with', 'by', 'at', 'from', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'but', 'or', 'so', 'for', 'nor', 'yet']);
    
    words.forEach(word => {
        word = word.replace(/[^\w]/g, '');
        if (word.length > 2 && !stopWords.has(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });
    
    // Score sentences
    const sentenceScores = sentences.map(sentence => {
        let score = 0;
        const wordsInSentence = sentence.toLowerCase().split(/\s+/);
        
        // Position importance (first and last sentences get higher scores)
        const index = sentences.indexOf(sentence);
        if (index === 0) score += 3;
        if (index === sentences.length - 1) score += 2;
        
        // Word frequency score
        wordsInSentence.forEach(word => {
            word = word.replace(/[^\w]/g, '');
            if (wordFreq[word]) score += wordFreq[word];
        });
        
        // Sentence length normalizer (prefer medium length sentences)
        const length = wordsInSentence.length;
        if (length > 5 && length < 30) score *= 1.2;
        if (length > 50) score *= 0.7;
        
        return { sentence, score };
    });
    
    // Sort by score and pick top sentences (30% of original or max 20 sentences)
    sentenceScores.sort((a, b) => b.score - a.score);
    const numSentences = Math.min(Math.max(Math.ceil(sentences.length * 0.3), 5), 20);
    const topSentences = sentenceScores.slice(0, numSentences);
    
    // Sort back to original order
    topSentences.sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));
    
    let summary = topSentences.map(item => item.sentence).join(' ');
    
    // Additional polish: ensure summary isn't too short
    if (summary.length < 200 && text.length > 500) {
        // Add more sentences if summary is too short
        const additional = sentenceScores.slice(numSentences, numSentences + 5);
        additional.forEach(item => {
            if (!summary.includes(item.sentence)) {
                summary += ' ' + item.sentence;
            }
        });
    }
    
    return summary;
}

// Format summary with better readability
function formatSummary(text) {
    // Split into smaller paragraphs
    let paragraphs = text.split(/[.!?]+\s+/);
    paragraphs = paragraphs.filter(p => p.trim().length > 30);
    
    let formatted = '';
    paragraphs.forEach(para => {
        if (para.trim()) {
            formatted += `<p>${para.trim()}. </p>`;
        }
    });
    
    // Add bullet points for lists if detected
    if (text.includes('first') || text.includes('second') || text.includes('finally')) {
        formatted = formatted.replace(/<p>(.*?)\. <\/p>/g, (match, content) => {
            if (content.toLowerCase().includes('first') || 
                content.toLowerCase().includes('second') ||
                content.toLowerCase().includes('finally')) {
                return `<li>${content}</li>`;
            }
            return match;
        });
        
        if (formatted.includes('<li>')) {
            formatted = `<ul>${formatted}</ul>`;
        }
    }
    
    // Add key insights header for longer summaries
    if (text.split(/\s+/).length > 200) {
        formatted = `<h3>🎯 Key Insights</h3>\n` + formatted;
    }
    
    return formatted;
}

// Copy to clipboard
copyBtn.addEventListener('click', async () => {
    const text = summaryContent.innerText;
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            copyBtn.textContent = '📋 Copy to Clipboard';
        }, 2000);
    } catch (err) {
        alert('Failed to copy text');
    }
});

// Add keyboard shortcut (Ctrl/Cmd + V for paste)
document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type === 'application/pdf') {
            const file = item.getAsFile();
            if (file) processPDF(file);
            break;
        }
    }
});
