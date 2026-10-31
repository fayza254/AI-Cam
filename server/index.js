import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;
let groqApiKey = process.env.GROQ_API_KEY || '';

const KNOWLEDGE_FILE = path.join(rootDir, 'data', 'knowledge_base.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(rootDir, 'public')));

// Helper to read knowledge base
function getKnowledgeBase() {
  try {
    if (fs.existsSync(KNOWLEDGE_FILE)) {
      const data = fs.readFileSync(KNOWLEDGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading knowledge base:', err.message);
  }
  return {
    system_role: "أنت المساعد الذكي الرسمي لشركة AiCAM المتخصصة في أنظمة الأمان والمراقبة الذكية.",
    tone: "احترافي، مهذب، دقيق، وسريع المساعدة.",
    company_overview: "AiCAM Smart Intelligent Security",
    core_services: [],
    custom_training_data: ""
  };
}

// Helper to save knowledge base
function saveKnowledgeBase(data) {
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Build system prompt based on knowledge base
function buildSystemPrompt(customOverride) {
  if (customOverride && customOverride.trim()) {
    return customOverride.trim();
  }

  const kb = getKnowledgeBase();
  let prompt = `${kb.system_role || 'أنت المساعد الذكي لشركة AiCAM'}\n\n`;

  if (kb.tone) {
    prompt += `**أسلوب الرد وسلوك المساعد:**\n${kb.tone}\n\n`;
  }

  if (kb.company_overview) {
    prompt += `**نبذة عن AiCAM (Smart Intelligent Security):**\n${kb.company_overview}\n\n`;
  }

  if (kb.core_services && kb.core_services.length > 0) {
    prompt += `**الخدمات والمنتجات الأساسية:**\n`;
    kb.core_services.forEach(item => {
      prompt += `- ${item}\n`;
    });
    prompt += '\n';
  }

  if (kb.custom_training_data && kb.custom_training_data.trim()) {
    prompt += `**بيانات التدريب والمعلومات التفصيلية المخصصة للشركة:**\n${kb.custom_training_data.trim()}\n\n`;
  }

  prompt += `**تعليمات هامة:**
1. أنت تمثل شركة AiCAM رسمياً، كن دائماً ودوداً، احترافياً، وقدم إجابات واضحة ومنظمة بتنسيق Markdown جميل (عناوين، نقاط، جداول إن لزم).
2. إذا سألك العميل عن تفاصيل أو أسعار دقيقة غير مذكورة في بيانات الشركة، رحب به وأبلغه بالخطوط العامة واعرض عليه التواصل المباشر مع فريق المبيعات أو الدعم الفني.
3. التزم بالهوية المؤسسية الراقية للشركة (Smart Intelligent Security).`;

  return prompt;
}

// Fallback order for models if 429 rate limit is hit
const FALLBACK_MODELS = [
  'openai/gpt-oss-120b',
  'allam-2-7b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
];

// Call Groq API with automatic fallback on 429 rate limit
async function fetchGroqChat({ model, messages, temperature, max_tokens, stream }) {
  // Safe max_tokens adjustment: qwen has 1000 OTPM limit on free tier, clamp to 600
  let effectiveMaxTokens = max_tokens;
  if (model.includes('qwen') && effectiveMaxTokens > 600) {
    effectiveMaxTokens = 600;
  }

  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      console.log(`Sending request with model: ${currentModel} (max_tokens: ${effectiveMaxTokens})...`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: currentModel,
          messages,
          temperature: parseFloat(temperature),
          max_tokens: parseInt(effectiveMaxTokens, 10),
          stream: !!stream
        })
      });

      if (response.status === 429) {
        const errText = await response.text();
        console.warn(`Model ${currentModel} hit 429 Rate Limit. Trying next fallback model... Error:`, errText);
        lastError = new Error(`Rate limit reached on ${currentModel}`);
        continue; // Try next fallback model
      }

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `خطأ في الـ API (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error && parsed.error.message) {
            errMsg = parsed.error.message;
          }
        } catch (e) {}
        throw new Error(errMsg);
      }

      // Success
      return { response, activeModel: currentModel, switched: currentModel !== model };

    } catch (err) {
      if (err.message.includes('Rate limit') || err.message.includes('429')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('جميع النماذج تجاوزت حد الاستخدام المؤقت (Rate Limit). يرجى الانتظار بضع ثوانٍ وإعادة المحاولة.');
}

// API: Get current knowledge base
app.get('/api/knowledge', (req, res) => {
  const kb = getKnowledgeBase();
  res.json({ success: true, data: kb });
});

// API: Update knowledge base
app.post('/api/knowledge', (req, res) => {
  try {
    const updated = req.body;
    saveKnowledgeBase(updated);
    res.json({ success: true, message: 'تم حفظ وتحديث قاعدة المعرفة بنجاح!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get available models and app info
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${groqApiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    const data = await response.json();
    const models = data.data || [];
    
    const recommended = [
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B (النموذج الأقوى والأعلى سعة)', speed: 'سريع وذكي' },
      { id: 'allam-2-7b', name: 'ALLaM 2 7B (النموذج العربي الوطني - فائق السرعة)', speed: 'خارق السرعة' },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (متعدد اللغات)', speed: 'سريع' },
      { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (خفيف واقتصادي)', speed: 'سريع جداً' }
    ];
    
    res.json({
      success: true,
      currentApiKeyMasked: groqApiKey ? `${groqApiKey.substring(0, 6)}...${groqApiKey.slice(-4)}` : 'None',
      recommended,
      models: models.map(m => ({ id: m.id, active: m.active }))
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      recommended: [
        { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
        { id: 'allam-2-7b', name: 'ALLaM 2 7B' },
        { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B' },
        { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' }
      ]
    });
  }
});

// API: Update API Key
app.post('/api/settings/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.startsWith('gsk_')) {
    return res.status(400).json({ success: false, error: 'مفتاح API غير صالح' });
  }
  groqApiKey = apiKey.trim();
  res.json({ success: true, message: 'تم تحديث مفتاح API بنجاح!' });
});

// API: Chat completions (supports streaming SSE with auto fallback)
app.post('/api/chat', async (req, res) => {
  const {
    messages = [],
    model = 'openai/gpt-oss-120b',
    temperature = 0.6,
    max_tokens = 1024,
    stream = true,
    system_prompt_override = null
  } = req.body;

  if (!groqApiKey) {
    return res.status(400).json({ success: false, error: 'مفتاح Groq API غير محدد في الخادم.' });
  }

  if (!messages || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'لا توجد رسائل مرسلة.' });
  }

  // Inject system prompt with latest AiCAM knowledge
  const systemPrompt = buildSystemPrompt(system_prompt_override);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  try {
    const { response: groqResponse, activeModel, switched } = await fetchGroqChat({
      model,
      messages: fullMessages,
      temperature,
      max_tokens,
      stream
    });

    if (stream) {
      // Set headers for Server-Sent Events (SSE)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (switched) {
        res.write(`data: ${JSON.stringify({ notification: `تم التبديل تلقائياً إلى النموذج (${activeModel}) لضمان استمرار المحادثة دون انتظار Rate limit.` })}\n\n`);
      }

      const reader = groqResponse.body.getReader();
      const decoder = new TextDecoder();
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
          if (trimmed === 'data: [DONE]') {
            res.write(`data: [DONE]\n\n`);
            continue;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6);
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                res.write(`data: ${JSON.stringify({
                  content: delta.content || '',
                  reasoning: delta.reasoning || '',
                  model: activeModel
                })}\n\n`);
              }
            } catch (parseErr) {}
          }
        }
      }

      res.write(`data: [DONE]\n\n`);
      return res.end();
    } else {
      const result = await groqResponse.json();
      const choice = result.choices?.[0];
      return res.json({
        success: true,
        model: activeModel,
        switched,
        message: choice?.message || { role: 'assistant', content: '' },
        usage: result.usage
      });
    }
  } catch (err) {
    console.error('Server error in /api/chat:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 AiCAM Chatbot Server is running at: http://localhost:${PORT}`);
  console.log(`🔒 Brand: AiCAM (Smart Intelligent Security)`);
  console.log(`⚡ Powered by Groq API (Auto-fallback enabled)`);
  console.log(`======================================================\n`);
});
