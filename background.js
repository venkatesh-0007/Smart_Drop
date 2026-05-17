// background.js for Smart Drop Chrome Extension

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Smart Drop Extension Installed");
  
  // Create context menu for AI Summarizer
  chrome.contextMenus.create({
    id: "smart-drop-summarize",
    title: "Summarize with Smart Drop AI",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "smart-drop-summarize") {
    chrome.tabs.sendMessage(tab.id, {
      action: "AI_SUMMARIZE",
      text: info.selectionText
    });
  }
});

// Relay messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_AUTH_WINDOW") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error("Smart Drop Auth Error:", chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, token: token });
      }
    });
    return true; 
  }

  if (request.action === "AI_REQUEST") {
    handleAIRequest(request, sendResponse);
    return true;
  }
});

async function handleAIRequest(request, sendResponse) {
  const { provider, apiKey, prompt, text } = request;
  
  if (!apiKey) {
    sendResponse({ success: false, error: "API Key is missing. Please add it in Settings." });
    return;
  }

  const systemPrompt = "You are a helpful assistant. Provide clear, concise responses.";
  
  try {
    let response;
    if (provider === "openai") {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Text to summarize: ${text}\n\nUser request: ${prompt || "Summarize this text."}` }
          ]
        })
      });
    } else if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            { role: "user", content: `Text: ${text}\n\nRequest: ${prompt || "Summarize this."}` }
          ]
        })
      });
    } else if (provider === "google") {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: `Text: ${text}\n\nRequest: ${prompt || "Summarize this."}` }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1024
          }
        })
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.error || "API request failed");
    }

    const data = await response.json();
    sendResponse({ success: true, data: data });
  } catch (error) {
    console.error("Smart Drop AI Error:", error.message);
    sendResponse({ success: false, error: error.message });
  }
}