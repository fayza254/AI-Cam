// ========================================================
// AiCAM Smart Intelligent Security - Chatbot Engine
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatMessages = document.getElementById('chatMessages');
  const welcomeView = document.getElementById('welcomeView');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const sendIcon = document.getElementById('sendIcon');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const charCount = document.getElementById('charCount');
  const micBtn = document.getElementById('micBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const statusText = document.getElementById('statusText');
  const activeModelLabel = document.getElementById('activeModelLabel');
  const stopGeneratingContainer = document.getElementById('stopGeneratingContainer');
  const stopGeneratingBtn = document.getElementById('stopGeneratingBtn');

  // Modals
  const knowledgeModal = document.getElementById('knowledgeModal');
  const openKnowledgeBtn = document.getElementById('openKnowledgeBtn');
  const closeKnowledgeModalBtn = document.getElementById('closeKnowledgeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const saveKnowledgeBtn = document.getElementById('saveKnowledgeBtn');
  const saveStatusMsg = document.getElementById('saveStatusMsg');
  const clearKbBtn = document.getElementById('clearKbBtn');
  const kbFileInput = document.getElementById('kbFileInput');

  const brandModal = document.getElementById('brandModal');
  const brandInfoBtn = document.getElementById('brandInfoBtn');
  const closeBrandModalBtn = document.getElementById('closeBrandModalBtn');

  // Form Fields in Modal
  const headerModelSelect = document.getElementById('headerModelSelect');
  const kbCustomDataInput = document.getElementById('kbCustomDataInput');
  const kbRoleInput = document.getElementById('kbRoleInput');
  const kbToneInput = document.getElementById('kbToneInput');
  const kbOverviewInput = document.getElementById('kbOverviewInput');
  const kbServicesInput = document.getElementById('kbServicesInput');
  const modelSelect = document.getElementById('modelSelect');
  const tempRange = document.getElementById('tempRange');
  const tempValue = document.getElementById('tempValue');
  const tokensRange = document.getElementById('tokensRange');
  const tokensValue = document.getElementById('tokensValue');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const updateApiKeyBtn = document.getElementById('updateApiKeyBtn');

  // --- State Variables ---
  let messages = [];
  let currentModel = localStorage.getItem('aicam_model') || 'openai/gpt-oss-120b';
  let temperature = parseFloat(localStorage.getItem('aicam_temp') || '0.6');
  let maxTokens = parseInt(localStorage.getItem('aicam_tokens') || '1024', 10);
  let isGenerating = false;
  let activeAbortController = null;
  let speechRecognition = null;
  let isListening = false;

  // Marked.js Configuration
  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {}
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
  });

  // --- Initialize App ---
  initTheme();
  loadKnowledgeData();
  loadSavedChat();
  setupEventListeners();
  updateModelUI();

  // --- Functions ---

  function initTheme() {
    const savedTheme = localStorage.getItem('aicam_theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      themeIcon.classList.replace('fa-sun', 'fa-moon');
    } else {
      document.documentElement.classList.add('dark');
      themeIcon.classList.replace('fa-moon', 'fa-sun');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    if (isDark) {
      localStorage.setItem('aicam_theme', 'dark');
      themeIcon.classList.replace('fa-moon', 'fa-sun');
    } else {
      localStorage.setItem('aicam_theme', 'light');
      themeIcon.classList.replace('fa-sun', 'fa-moon');
    }
  }

  function updateModelUI() {
    if (headerModelSelect) {
      headerModelSelect.value = currentModel;
    }
    if (modelSelect) {
      modelSelect.value = currentModel;
    }
  }

  function loadSavedChat() {
    try {
      const saved = localStorage.getItem('aicam_chat_history');
      if (saved) {
        messages = JSON.parse(saved);
        if (messages.length > 0) {
          welcomeView.classList.add('hidden');
          messages.forEach(msg => {
            renderMessage(msg.role, msg.content, msg.reasoning, false);
          });
          scrollToBottom();
        }
      }
    } catch (e) {
      console.error('Error loading saved chat:', e);
      messages = [];
    }
  }

  function saveChatHistory() {
    try {
      localStorage.setItem('aicam_chat_history', JSON.stringify(messages));
    } catch (e) {
      console.error('Error saving chat:', e);
    }
  }

  async function loadKnowledgeData() {
    try {
      const res = await fetch('/api/knowledge');
      const data = await res.json();
      if (data.success && data.data) {
        const kb = data.data;
        if (kbCustomDataInput) kbCustomDataInput.value = kb.custom_training_data || '';
        if (kbRoleInput) kbRoleInput.value = kb.system_role || '';
        if (kbToneInput) kbToneInput.value = kb.tone || '';
        if (kbOverviewInput) kbOverviewInput.value = kb.company_overview || '';
        if (kbServicesInput) kbServicesInput.value = (kb.core_services || []).join('\n');
      }

      // Also fetch model & api key info
      const modelsRes = await fetch('/api/models');
      const modelsData = await modelsRes.json();
      if (modelsData.success && apiKeyInput) {
        apiKeyInput.placeholder = `المفتاح الحالي: ${modelsData.currentApiKeyMasked || 'مفعل'}`;
      }
    } catch (err) {
      console.error('Failed to load knowledge data:', err);
    }
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
    const hasText = chatInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || isGenerating;
    clearInputBtn.classList.toggle('hidden', !hasText);
    charCount.textContent = `${chatInput.value.length} حرف`;
  }

  // --- Rendering Chat Messages ---
  function renderMessage(role, content, reasoning = '', animate = true) {
    const isUser = role === 'user';
    const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    const messageRow = document.createElement('div');
    messageRow.id = msgId;
    messageRow.className = `flex gap-3 sm:gap-4 max-w-4xl mx-auto ${animate ? 'message-appear' : ''} ${isUser ? 'justify-end' : 'justify-start'}`;

    if (isUser) {
      // User Message Layout
      messageRow.innerHTML = `
        <div class="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
          <div class="px-4 py-3 rounded-2xl rounded-tr-sm bg-gradient-to-r from-brand-orange to-brand-orangeHover text-white shadow-md text-sm sm:text-base leading-relaxed break-words whitespace-pre-wrap">
            ${escapeHtml(content)}
          </div>
          <div class="text-[10px] text-gray-400 mt-1 px-1 flex items-center gap-1">
            <span>أنت</span>
            <span>•</span>
            <span>${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div class="w-8 h-8 rounded-full bg-[#2c2c2c] border border-[#3e3e3e] flex items-center justify-center text-xs text-gray-300 shrink-0 mt-1">
          <i class="fa-solid fa-user"></i>
        </div>
      `;
    } else {
      // Assistant (AiCAM) Message Layout
      const hasReasoning = reasoning && reasoning.trim().length > 0;
      const reasoningHtml = hasReasoning ? `
        <details class="mb-3 rounded-xl bg-black/25 border border-[#333333] p-2 text-xs">
          <summary class="cursor-pointer font-semibold text-gray-400 hover:text-brand-orange flex items-center gap-1.5 py-1 px-1 select-none">
            <i class="fa-solid fa-bolt text-brand-orange text-[11px]"></i>
            <span>خطوات التحليل والتفكير الذكي (${reasoning.length} حرف)</span>
          </summary>
          <div class="mt-2 text-gray-400 font-mono text-[11px] leading-relaxed p-2 bg-black/40 rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto">
            ${escapeHtml(reasoning)}
          </div>
        </details>
      ` : '';

      const parsedMarkdown = DOMPurify.sanitize(marked.parse(content || ''));

      messageRow.innerHTML = `
        <div class="w-8 h-8 rounded-xl bg-brand-orange/15 border border-brand-orange/40 flex items-center justify-center p-1.5 shrink-0 shadow-sm mt-1">
          <img src="assets/icon.svg" class="w-full h-full object-contain" alt="AiCAM Bot" />
        </div>
        
        <div class="flex-1 flex flex-col max-w-[90%] sm:max-w-[85%]">
          <!-- Content Bubble -->
          <div class="ai-bubble px-4 sm:px-5 py-4 rounded-2xl rounded-tl-sm bg-[#1e1e1e] border border-[#303030] shadow-sm text-gray-200">
            ${reasoningHtml}
            <div class="prose-aicam text-sm sm:text-base leading-relaxed break-words markdown-body">
              ${parsedMarkdown}
            </div>
          </div>

          <!-- Bottom Action Toolbar -->
          <div class="flex items-center justify-between text-[11px] text-gray-400 mt-1.5 px-1">
            <div class="flex items-center gap-1 text-[10px]">
              <span class="text-brand-orange font-bold">AiCAM</span>
              <span>•</span>
              <span class="text-gray-500 font-mono">${currentModel.split('/').pop()}</span>
            </div>

            <div class="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
              <button class="copy-btn p-1.5 rounded hover:bg-[#2c2c2c] text-gray-400 hover:text-white transition-all" title="نسخ الرد">
                <i class="fa-regular fa-copy"></i>
              </button>
              <button class="tts-btn p-1.5 rounded hover:bg-[#2c2c2c] text-gray-400 hover:text-brand-orange transition-all" title="قراءة صوتية">
                <i class="fa-solid fa-volume-high"></i>
              </button>
              <button class="retry-btn p-1.5 rounded hover:bg-[#2c2c2c] text-gray-400 hover:text-white transition-all" title="إعادة التوليد">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          </div>
        </div>
      `;

      // Attach action listeners
      const copyBtn = messageRow.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(content).then(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i>';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
            }, 2000);
          });
        });
      }

      const ttsBtn = messageRow.querySelector('.tts-btn');
      if (ttsBtn) {
        ttsBtn.addEventListener('click', () => {
          speakText(content, ttsBtn);
        });
      }

      const retryBtn = messageRow.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          regenerateLastResponse();
        });
      }
    }

    chatMessages.appendChild(messageRow);
    return messageRow;
  }

  // --- Send Message & Stream Response ---
  async function handleSendMessage(customText = null) {
    const text = customText !== null ? customText.trim() : chatInput.value.trim();
    if (!text || isGenerating) return;

    // Reset input
    chatInput.value = '';
    adjustTextareaHeight();

    // Hide welcome view
    welcomeView.classList.add('hidden');

    // Add User Message to State & UI
    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    messages.push(userMsg);
    renderMessage('user', text);
    saveChatHistory();
    scrollToBottom();

    // Prepare Assistant Placeholder
    isGenerating = true;
    updateSendButtonState();
    stopGeneratingContainer.classList.remove('hidden');

    const assistantPlaceholderRow = document.createElement('div');
    assistantPlaceholderRow.className = 'flex gap-3 sm:gap-4 max-w-4xl mx-auto message-appear justify-start';
    assistantPlaceholderRow.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-brand-orange/15 border border-brand-orange/40 flex items-center justify-center p-1.5 shrink-0 shadow-sm mt-1 animate-pulse">
        <img src="assets/icon.svg" class="w-full h-full object-contain" alt="AiCAM Bot" />
      </div>
      <div class="flex-1 flex flex-col max-w-[90%] sm:max-w-[85%]">
        <div class="ai-bubble px-4 sm:px-5 py-4 rounded-2xl rounded-tl-sm bg-[#1e1e1e] border border-[#303030] shadow-sm text-gray-200">
          <!-- Dynamic Reasoning Container -->
          <div class="reasoning-box hidden mb-3 rounded-xl bg-black/25 border border-[#333333] p-2 text-xs">
            <details open>
              <summary class="cursor-pointer font-semibold text-brand-orange flex items-center gap-1.5 py-1 px-1 select-none">
                <i class="fa-solid fa-spinner fa-spin text-[11px]"></i>
                <span class="reasoning-label">جاري التفكير والتحليل الذكي...</span>
              </summary>
              <div class="reasoning-content mt-2 text-gray-400 font-mono text-[11px] leading-relaxed p-2 bg-black/40 rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto"></div>
            </details>
          </div>
          <!-- Content Markdown -->
          <div class="prose-aicam text-sm sm:text-base leading-relaxed break-words markdown-body typing-cursor">
            <span class="inline-flex items-center gap-1 text-gray-400 text-xs font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-orange animate-ping"></span>
              AiCAM يكتب الآن...
            </span>
          </div>
        </div>
      </div>
    `;

    chatMessages.appendChild(assistantPlaceholderRow);
    scrollToBottom();

    let accumulatedContent = '';
    let accumulatedReasoning = '';
    const contentContainer = assistantPlaceholderRow.querySelector('.prose-aicam');
    const reasoningBox = assistantPlaceholderRow.querySelector('.reasoning-box');
    const reasoningContent = assistantPlaceholderRow.querySelector('.reasoning-content');
    const reasoningLabel = assistantPlaceholderRow.querySelector('.reasoning-label');

    activeAbortController = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: activeAbortController.signal,
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          model: currentModel,
          temperature,
          max_tokens: maxTokens,
          stream: true
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || `خطأ في الخادم (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              
              if (data.error) {
                throw new Error(data.error);
              }

              // Check if reasoning chunk is returned
              if (data.reasoning) {
                accumulatedReasoning += data.reasoning;
                reasoningBox.classList.remove('hidden');
                reasoningContent.textContent = accumulatedReasoning;
                reasoningLabel.textContent = `خطوات التحليل والتفكير (${accumulatedReasoning.length} حرف)...`;
                scrollToBottom();
              }

              // Check if content chunk is returned
              if (data.content) {
                accumulatedContent += data.content;
                contentContainer.innerHTML = DOMPurify.sanitize(marked.parse(accumulatedContent));
                scrollToBottom();
              }
            } catch (jsonErr) {
              // Ignore single partial chunk errors
            }
          }
        }
      }

      // Finalize message
      contentContainer.classList.remove('typing-cursor');
      if (accumulatedContent.trim().length === 0 && accumulatedReasoning.trim().length > 0) {
        accumulatedContent = accumulatedReasoning;
      }

      // Remove placeholder row and render with full buttons
      assistantPlaceholderRow.remove();
      const finalAssistantMsg = {
        role: 'assistant',
        content: accumulatedContent,
        reasoning: accumulatedReasoning,
        timestamp: Date.now()
      };
      messages.push(finalAssistantMsg);
      renderMessage('assistant', accumulatedContent, accumulatedReasoning, false);
      saveChatHistory();
      scrollToBottom();

    } catch (err) {
      if (err.name === 'AbortError') {
        contentContainer.classList.remove('typing-cursor');
        if (accumulatedContent) {
          assistantPlaceholderRow.remove();
          const stoppedMsg = {
            role: 'assistant',
            content: accumulatedContent + '\n\n*(تم إيقاف التوليد)*',
            reasoning: accumulatedReasoning,
            timestamp: Date.now()
          };
          messages.push(stoppedMsg);
          renderMessage('assistant', stoppedMsg.content, accumulatedReasoning, false);
          saveChatHistory();
        } else {
          assistantPlaceholderRow.remove();
        }
      } else {
        console.error('Chat error:', err);
        assistantPlaceholderRow.remove();
        renderErrorMessage(err.message || 'حدث خطأ أثناء الاتصال بالـ API');
      }
    } finally {
      isGenerating = false;
      activeAbortController = null;
      updateSendButtonState();
      stopGeneratingContainer.classList.add('hidden');
      chatInput.focus();
    }
  }

  function renderErrorMessage(errorText) {
    const errRow = document.createElement('div');
    errRow.className = 'flex gap-3 sm:gap-4 max-w-4xl mx-auto message-appear justify-start';
    
    // Check if error is rate limit
    const isRateLimit = errorText.toLowerCase().includes('rate limit') || errorText.includes('429') || errorText.includes('OTPM');
    
    errRow.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-amber-900/30 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 mt-1">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="flex-1 px-4 py-3 rounded-2xl bg-[#241c1c] border border-amber-800/40 text-amber-200 text-sm">
        <p class="font-bold flex items-center gap-1.5 mb-1 text-white">
          <i class="fa-solid fa-circle-exclamation text-brand-orange"></i>
          ${isRateLimit ? 'تم بلوغ الحد المؤقت للنموذج الحالي (Rate Limit)' : 'تعذر إتمام الطلب'}
        </p>
        <p class="text-xs text-gray-300 font-mono mb-3 bg-black/40 p-2 rounded-lg leading-relaxed">${escapeHtml(errorText)}</p>
        
        <div class="pt-2 border-t border-amber-800/30 flex flex-wrap items-center gap-2">
          <span class="text-xs text-gray-300 font-medium">حلول سريعة بنقرة واحدة:</span>
          
          <button class="switch-model-btn px-3 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orangeHover text-white text-xs font-bold transition-all shadow-sm" data-model="openai/gpt-oss-120b">
            ⚡ استخدام GPT OSS 120B (موصى به)
          </button>
          
          <button class="switch-model-btn px-3 py-1.5 rounded-lg bg-[#2e2e2e] hover:bg-[#383838] border border-[#444] text-white text-xs font-medium transition-all" data-model="allam-2-7b">
            🚀 استخدام ALLaM 2 7B العربي
          </button>

          <button class="retry-error-btn px-3 py-1.5 rounded-lg bg-[#2e2e2e] hover:bg-[#383838] border border-[#444] text-gray-300 hover:text-white text-xs transition-all">
            🔄 إعادة المحاولة الآن
          </button>
        </div>
      </div>
    `;

    // Attach click events
    errRow.querySelectorAll('.switch-model-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetModel = btn.getAttribute('data-model');
        currentModel = targetModel;
        localStorage.setItem('aicam_model', targetModel);
        updateModelUI();
        errRow.remove();
        regenerateLastResponse();
      });
    });

    const retryBtn = errRow.querySelector('.retry-error-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        errRow.remove();
        regenerateLastResponse();
      });
    }

    chatMessages.appendChild(errRow);
    scrollToBottom();
  }

  function regenerateLastResponse() {
    if (isGenerating || messages.length === 0) return;
    // Find last user message
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    const lastUserPrompt = messages[lastUserIndex].content;
    // Remove subsequent messages from state and UI
    messages = messages.slice(0, lastUserIndex);
    saveChatHistory();

    // Re-render UI up to that point
    chatMessages.innerHTML = '';
    messages.forEach(msg => {
      renderMessage(msg.role, msg.content, msg.reasoning, false);
    });

    handleSendMessage(lastUserPrompt);
  }

  function updateSendButtonState() {
    if (isGenerating) {
      sendBtn.disabled = true;
      sendIcon.className = 'fa-solid fa-spinner fa-spin text-base';
    } else {
      sendBtn.disabled = chatInput.value.trim().length === 0;
      sendIcon.className = 'fa-solid fa-arrow-up text-base transform -rotate-45';
    }
  }

  // --- Speech-to-Text & Text-to-Speech ---
  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      micBtn.style.display = 'none';
      return;
    }

    speechRecognition = new SpeechRec();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'ar-SA';

    speechRecognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('text-red-500', 'animate-pulse');
    };

    speechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + transcript;
      adjustTextareaHeight();
    };

    speechRecognition.onerror = (e) => {
      console.warn('Speech error:', e.error);
      stopListening();
    };

    speechRecognition.onend = () => {
      stopListening();
    };

    micBtn.addEventListener('click', () => {
      if (isListening) {
        speechRecognition.stop();
      } else {
        try {
          speechRecognition.start();
        } catch (e) {
          console.warn(e);
        }
      }
    });
  }

  function stopListening() {
    isListening = false;
    micBtn.classList.remove('text-red-500', 'animate-pulse');
  }

  function speakText(text, btnElement) {
    if (!('speechSynthesis' in window)) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
      return;
    }

    const cleanText = text.replace(/[#*`_~\[\]]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;

    btnElement.innerHTML = '<i class="fa-solid fa-stop text-brand-orange animate-pulse"></i>';

    utterance.onend = () => {
      btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    };
    utterance.onerror = () => {
      btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    };

    window.speechSynthesis.speak(utterance);
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Input Keydown
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    chatInput.addEventListener('input', adjustTextareaHeight);

    // Send Button
    sendBtn.addEventListener('click', () => handleSendMessage());

    // Clear Input
    clearInputBtn.addEventListener('click', () => {
      chatInput.value = '';
      adjustTextareaHeight();
      chatInput.focus();
    });

    // Stop Generating Button
    stopGeneratingBtn.addEventListener('click', () => {
      if (activeAbortController) {
        activeAbortController.abort();
      }
    });

    // New Chat Button
    newChatBtn.addEventListener('click', () => {
      if (messages.length === 0) return;
      if (confirm('هل تريد بدء محادثة جديدة ومسح سجل المحادثة الحالية؟')) {
        messages = [];
        localStorage.removeItem('aicam_chat_history');
        chatMessages.innerHTML = '';
        welcomeView.classList.remove('hidden');
        chatMessages.appendChild(welcomeView);
        chatInput.value = '';
        adjustTextareaHeight();
      }
    });

    // Theme Toggle Button
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Suggestion Cards Click
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          handleSendMessage(prompt);
        }
      });
    });

    // Speech-to-text
    setupSpeechRecognition();

    // Modals: Knowledge Base
    openKnowledgeBtn.addEventListener('click', () => {
      loadKnowledgeData();
      knowledgeModal.classList.remove('hidden');
      knowledgeModal.classList.add('flex');
    });

    const closeKnowledgeModal = () => {
      knowledgeModal.classList.add('hidden');
      knowledgeModal.classList.remove('flex');
    };
    closeKnowledgeModalBtn.addEventListener('click', closeKnowledgeModal);
    cancelModalBtn.addEventListener('click', closeKnowledgeModal);

    // Tabs inside Knowledge Base Modal
    const kbTabs = document.querySelectorAll('.kb-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    kbTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        kbTabs.forEach(t => {
          t.classList.remove('active', 'border-brand-orange', 'text-brand-orange');
          t.classList.add('border-transparent', 'text-gray-400');
        });
        tab.classList.add('active', 'border-brand-orange', 'text-brand-orange');
        tab.classList.remove('border-transparent', 'text-gray-400');

        const target = tab.getAttribute('data-tab');
        tabPanes.forEach(pane => {
          pane.classList.toggle('hidden', pane.id !== target);
        });
      });
    });

    // Clear KB Custom Data
    clearKbBtn.addEventListener('click', () => {
      if (confirm('هل أنت متأكد من تفريغ حقل بيانات التدريب؟')) {
        kbCustomDataInput.value = '';
      }
    });

    // Upload File for Knowledge Base
    kbFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        kbCustomDataInput.value = (kbCustomDataInput.value ? kbCustomDataInput.value + '\n\n' : '') + event.target.result;
        alert(`تم استيراد الملف "${file.name}" بنجاح! لا تنس النقر على "حفظ وتطبيق البيانات".`);
      };
      reader.readAsText(file);
    });

    // Sliders
    tempRange.addEventListener('input', () => {
      tempValue.textContent = tempRange.value;
      temperature = parseFloat(tempRange.value);
      localStorage.setItem('aicam_temp', temperature);
    });

    tokensRange.addEventListener('input', () => {
      tokensValue.textContent = tokensRange.value;
      maxTokens = parseInt(tokensRange.value, 10);
      localStorage.setItem('aicam_tokens', maxTokens);
    });

    if (headerModelSelect) {
      headerModelSelect.addEventListener('change', () => {
        currentModel = headerModelSelect.value;
        localStorage.setItem('aicam_model', currentModel);
        updateModelUI();
      });
    }

    modelSelect.addEventListener('change', () => {
      currentModel = modelSelect.value;
      localStorage.setItem('aicam_model', currentModel);
      updateModelUI();
    });

    // Save Knowledge Base
    saveKnowledgeBtn.addEventListener('click', async () => {
      saveKnowledgeBtn.disabled = true;
      saveKnowledgeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

      const payload = {
        system_role: kbRoleInput.value.trim(),
        tone: kbToneInput.value.trim(),
        company_overview: kbOverviewInput.value.trim(),
        core_services: kbServicesInput.value.split('\n').map(s => s.trim()).filter(Boolean),
        custom_training_data: kbCustomDataInput.value.trim()
      };

      try {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          saveStatusMsg.classList.remove('hidden');
          setTimeout(() => saveStatusMsg.classList.add('hidden'), 3000);
        } else {
          alert('خطأ أثناء الحفظ: ' + result.error);
        }
      } catch (e) {
        alert('تعذر الاتصال بالخادم لحفظ البيانات: ' + e.message);
      } finally {
        saveKnowledgeBtn.disabled = false;
        saveKnowledgeBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>حفظ وتطبيق البيانات</span>';
      }
    });

    // Update API Key Button
    updateApiKeyBtn.addEventListener('click', async () => {
      const newKey = apiKeyInput.value.trim();
      if (!newKey) {
        alert('يرجى إدخال مفتاح API صحيح');
        return;
      }
      try {
        const res = await fetch('/api/settings/apikey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: newKey })
        });
        const result = await res.json();
        if (result.success) {
          alert('تم تحديث مفتاح الـ API بنجاح!');
          apiKeyInput.value = '';
          loadKnowledgeData();
        } else {
          alert('خطأ: ' + result.error);
        }
      } catch (e) {
        alert('فشل تحديث المفتاح: ' + e.message);
      }
    });

    // Brand Guide Modal
    brandInfoBtn.addEventListener('click', () => {
      brandModal.classList.remove('hidden');
      brandModal.classList.add('flex');
    });
    closeBrandModalBtn.addEventListener('click', () => {
      brandModal.classList.add('hidden');
      brandModal.classList.remove('flex');
    });

    // Close Modals on click outside
    [knowledgeModal, brandModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }
      });
    });
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
});
