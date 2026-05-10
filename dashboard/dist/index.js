/**
 * Hermes WebUI Dashboard Plugin — Native React UI
 *
 * Complete WebUI interface as a single IIFE using the Hermes Dashboard Plugin SDK.
 * No iframe, no separate server, no build step.
 * All management APIs use SDK.api.* methods.
 * Chat uses SSE via /api/plugins/hermes-webui/chat/stream/{id}
 */
(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) {
    console.error("[hermes-webui] Plugin SDK not available");
    return;
  }

  var React = SDK.React;
  var hooks = SDK.hooks;
  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useCallback = hooks.useCallback;
  var useRef = hooks.useRef;
  var components = SDK.components;
  var Card = components.Card;
  var CardHeader = components.CardHeader;
  var CardTitle = components.CardTitle;
  var CardContent = components.CardContent;
  var Badge = components.Badge;
  var Button = components.Button;
  var Input = components.Input;
  var Select = components.Select;
  var SelectOption = components.SelectOption;
  var Separator = components.Separator;
  var Tabs = components.Tabs;
  var TabsList = components.TabsList;
  var TabsTrigger = components.TabsTrigger;
  var api = SDK.api;
  var fetchJSON = SDK.fetchJSON;
  var cn = SDK.utils.cn;
  var timeAgo = SDK.utils.timeAgo;

  // =========================================================================
  // Utility: Markdown Renderer
  // =========================================================================
  function MarkdownRenderer(props) {
    var raw = props.text || "";
    var lines = raw.split("\n");
    var elements = [];
    var i = 0;
    var key = 0;

    function esc(s) {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function inlineRender(text) {
      if (!text) return null;
      // Bold + Italic
      text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      // Bold
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Inline code
      text = text.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-sm font-mono">$1</code>');
      // Links
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-primary underline">$1</a>');
      return text;
    }

    while (i < lines.length) {
      var line = lines[i];
      var k = "md-" + (key++);

      // Fenced code block
      if (line.trim().startsWith("```")) {
        var lang = line.trim().slice(3).trim();
        var codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          React.createElement("pre", { key: k, className: "bg-muted rounded-lg p-4 overflow-x-auto my-2 text-sm font-mono" },
            lang
              ? React.createElement("div", { className: "text-xs text-muted-foreground mb-2" }, lang)
              : null,
            React.createElement("code", null, esc(codeLines.join("\n")))
          )
        );
        continue;
      }

      // Heading
      var hMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        var level = hMatch[1].length;
        var tag = "h" + level;
        var sizeClass = level === 1 ? "text-xl font-bold" : level === 2 ? "text-lg font-semibold" : "text-base font-medium";
        elements.push(
          React.createElement(tag, {
            key: k,
            className: cn(sizeClass, "mt-4 mb-2 text-foreground"),
            dangerouslySetInnerHTML: { __html: inlineRender(hMatch[2]) || hMatch[2] }
          })
        );
        i++;
        continue;
      }

      // Horizontal rule
      if (line.match(/^---+$/)) {
        elements.push(React.createElement("hr", { key: k, className: "my-4 border-border" }));
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        var qLines = [];
        while (i < lines.length && lines[i].startsWith("> ")) {
          qLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          React.createElement("blockquote", {
            key: k,
            className: "border-l-4 border-primary pl-4 my-2 text-muted-foreground italic",
            dangerouslySetInnerHTML: { __html: inlineRender(qLines.join("<br/>")) || esc(qLines.join("\n")) }
          })
        );
        continue;
      }

      // Unordered list
      if (line.match(/^[\-\*\+]\s+/)) {
        var ulItems = [];
        while (i < lines.length && lines[i].match(/^[\-\*\+]\s+/)) {
          ulItems.push(lines[i].replace(/^[\-\*\+]\s+/, ""));
          i++;
        }
        elements.push(
          React.createElement("ul", { key: k, className: "list-disc pl-6 my-2 space-y-1" },
            ulItems.map(function (item, idx) {
              return React.createElement("li", {
                key: k + "-" + idx,
                className: "text-sm",
                dangerouslySetInnerHTML: { __html: inlineRender(item) || esc(item) }
              });
            })
          )
        );
        continue;
      }

      // Ordered list
      if (line.match(/^\d+\.\s+/)) {
        var olItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
          olItems.push(lines[i].replace(/^\d+\.\s+/, ""));
          i++;
        }
        elements.push(
          React.createElement("ol", { key: k, className: "list-decimal pl-6 my-2 space-y-1" },
            olItems.map(function (item, idx) {
              return React.createElement("li", {
                key: k + "-" + idx,
                className: "text-sm",
                dangerouslySetInnerHTML: { __html: inlineRender(item) || esc(item) }
              });
            })
          )
        );
        continue;
      }

      // Paragraph (skip empty lines)
      if (line.trim() === "") {
        i++;
        continue;
      }

      // Collect paragraph lines
      var pLines = [];
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^(#{1,3}\s|```|---+$|>\s|[\-\*\+]\s|\d+\.\s)/)) {
        pLines.push(lines[i]);
        i++;
      }
      if (pLines.length > 0) {
        elements.push(
          React.createElement("p", {
            key: k,
            className: "text-sm leading-relaxed my-1",
            dangerouslySetInnerHTML: { __html: inlineRender(pLines.join("<br/>")) || esc(pLines.join("\n")) }
          })
        );
      }
    }

    return React.createElement("div", { className: "markdown-content" }, elements);
  }

  // =========================================================================
  // Loading Spinner
  // =========================================================================
  function LoadingSpinner(props) {
    return React.createElement("div", {
      className: "flex items-center justify-center py-12"
    },
      React.createElement("div", {
        className: cn(
          "w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin",
          props.className
        )
      })
    );
  }

  // =========================================================================
  // Error Display
  // =========================================================================
  function ErrorDisplay(props) {
    return React.createElement(Card, { className: "mx-4 mt-4 border-destructive/50" },
      React.createElement(CardContent, { className: "pt-6" },
        React.createElement("p", { className: "text-sm font-medium text-destructive" }, "Error"),
        React.createElement("p", { className: "text-sm text-muted-foreground mt-1" }, props.message || "Unknown error"),
        props.onRetry
          ? React.createElement(Button, {
              onClick: props.onRetry,
              className: "mt-3",
              variant: "outline"
            }, "Retry")
          : null
      )
    );
  }

  // =========================================================================
  // Tab: Chat
  // =========================================================================
  function ChatTab() {
    var sessionsState = useState([]);
    var sessions = sessionsState[0];
    var setSessions = sessionsState[1];
    var sessionIdState = useState(null);
    var sessionId = sessionIdState[0];
    var sessionIdSet = sessionIdState[1];
    var messagesState = useState([]);
    var messages = messagesState[0];
    var setMessages = messagesState[1];
    var inputState = useState("");
    var input = inputState[0];
    var setInput = inputState[1];
    var loadingState = useState(false);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var streamingState = useState(false);
    var streaming = streamingState[0];
    var setStreaming = streamingState[1];
    var streamText = useState("");
    var setStreamText = streamText[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];
    var eventSourceRef = useRef(null);
    var streamIdRef = useRef(null);

    // Load sessions on mount
    useEffect(function () {
      api.getSessions(50, 0).then(function (data) {
        var s = data.sessions || [];
        setSessions(s);
      }).catch(function (e) {
        setError("Failed to load sessions: " + e.message);
      });
    }, []);

    // Load messages when session changes
    var loadMessages = useCallback(function (sid) {
      if (!sid) return;
      setLoading(true);
      setError(null);
      api.getSessionMessages(sid).then(function (data) {
        setMessages(data.messages || []);
        setLoading(false);
      }).catch(function (e) {
        setError("Failed to load messages: " + e.message);
        setLoading(false);
      });
    }, []);

    var handleCreateSession = useCallback(function () {
      fetchJSON("/api/plugins/hermes-webui/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }).then(function (data) {
        sessionIdSet(data.session_id);
        setMessages([]);
        api.getSessions(50, 0).then(function (d) { setSessions(d.sessions || []); });
      }).catch(function (e) {
        setError("Failed to create session: " + e.message);
      });
    }, []);

    var handleSend = useCallback(function () {
      var msg = input.trim();
      if (!msg || !sessionId || streaming) return;
      setInput("");
      setStreaming(true);
      setStreamText("");
      setError(null);

      // Add user message immediately
      var userMsg = { role: "user", content: msg };
      setMessages(function (prev) { return prev.concat([userMsg]); });

      fetchJSON("/api/plugins/hermes-webui/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: msg })
      }).then(function (data) {
        var sid = data.stream_id;
        streamIdRef.current = sid;

        // Open SSE
        var base = window.__HERMES_BASE_PATH__ || "";
        var url = base + "/api/plugins/hermes-webui/chat/stream/" + sid;
        var es = new EventSource(url);
        eventSourceRef.current = es;

        es.addEventListener("token", function (e) {
          setStreamText(function (prev) { return prev + (JSON.parse(e.data)); });
        });

        es.addEventListener("tool", function (e) {
          var td = JSON.parse(e.data);
          setMessages(function (prev) {
            return prev.concat([{
              role: "tool",
              content: "[Tool: " + td.name + "] " + (td.preview || ""),
              tool_name: td.name
            }]);
          });
        });

        es.addEventListener("done", function (e) {
          var dd = JSON.parse(e.data);
          es.close();
          eventSourceRef.current = null;
          setStreamText(function (prev) {
            if (prev) {
              setMessages(function (m) { return m.concat([{ role: "assistant", content: prev }]); });
            }
            return "";
          });
          setStreaming(false);
          // Reload session to get updated messages
          if (dd.session_id) {
            setTimeout(function () { loadMessages(dd.session_id); }, 500);
          }
        });

        es.addEventListener("error", function (e) {
          var ed;
          try { ed = JSON.parse(e.data); } catch (_) { ed = e.data || "Unknown error"; }
          es.close();
          eventSourceRef.current = null;
          setError(typeof ed === "string" ? ed : ed.message || "Stream error");
          setStreaming(false);
        });

        es.onerror = function () {
          es.close();
          eventSourceRef.current = null;
          setStreaming(false);
        };
      }).catch(function (e) {
        setError("Failed to start chat: " + e.message);
        setStreaming(false);
      });
    }, [input, sessionId, streaming]);

    var handleKeyDown = useCallback(function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }, [handleSend]);

    return React.createElement("div", { className: "flex flex-col h-full" },
      // Session selector
      React.createElement("div", { className: "flex items-center gap-2 p-4 border-b border-border" },
        React.createElement(Select, {
          value: sessionId || "",
          onChange: function (v) {
            sessionIdSet(v);
            loadMessages(v);
          },
          placeholder: "Select session...",
          className: "flex-1"
        },
          (sessions[0] || []).map(function (s) {
            return React.createElement(SelectOption, { key: s.id, value: s.id },
              (s.title || s.id) + " — " + (s.model || "default")
            );
          })
        ),
        React.createElement(Button, { onClick: handleCreateSession, variant: "outline" }, "+ New")
      ),

      // Messages area
      React.createElement("div", { className: "flex-1 overflow-y-auto p-4 space-y-4" },
        loading
          ? React.createElement(LoadingSpinner, null)
          : error && messages.length === 0
            ? React.createElement(ErrorDisplay, { message: error, onRetry: sessionId ? function () { loadMessages(sessionId); } : null })
            : null,

        messages.map(function (msg, idx) {
          var isUser = msg.role === "user";
          var isTool = msg.role === "tool";
          return React.createElement("div", {
            key: "msg-" + idx,
            className: cn(
              "flex gap-3",
              isUser ? "justify-end" : "justify-start"
            )
          },
            React.createElement("div", {
              className: cn(
                "max-w-[80%] rounded-lg px-4 py-3",
                isUser ? "bg-primary text-primary-foreground" : "bg-muted",
                isTool ? "border border-yellow-500/30 bg-yellow-500/5" : ""
              )
            },
              React.createElement("div", { className: "flex items-center gap-2 mb-1" },
                React.createElement(Badge, {
                  className: cn("text-xs", isUser ? "bg-primary-foreground/20" : "")
                }, isUser ? "You" : isTool ? "Tool" : "Hermes"),
                msg.tool_name
                  ? React.createElement("span", { className: "text-xs text-muted-foreground" }, msg.tool_name)
                  : null
              ),
              isTool
                ? React.createElement("div", { className: "text-xs text-muted-foreground whitespace-pre-wrap" }, msg.content)
                : React.createElement(MarkdownRenderer, { text: msg.content || "" })
            )
          );
        }),

        // Streaming text
        streaming && streamText
          ? React.createElement("div", { className: "flex justify-start gap-3" },
              React.createElement("div", { className: "max-w-[80%] rounded-lg px-4 py-3 bg-muted" },
                React.createElement(Badge, { className: "text-xs mb-1" }, "Hermes"),
                React.createElement(MarkdownRenderer, { text: streamText })
              )
            )
          : null,

        // Streaming indicator (no text yet)
        streaming && !streamText
          ? React.createElement("div", { className: "flex justify-start gap-3" },
              React.createElement("div", { className: "rounded-lg px-4 py-3 bg-muted" },
                React.createElement("div", { className: "flex items-center gap-2" },
                  React.createElement(Badge, { className: "text-xs" }, "Hermes"),
                  React.createElement("span", { className: "text-sm text-muted-foreground animate-pulse" }, "Thinking...")
                )
              )
            )
          : null
      ),

      // Composer
      React.createElement("div", { className: "border-t border-border p-4" },
        React.createElement("div", { className: "flex gap-2" },
          React.createElement("textarea", {
            value: input,
            onChange: function (e) { setInput(e.target.value); },
            onKeyDown: handleKeyDown,
            placeholder: sessionId ? "Type a message... (Enter to send, Shift+Enter for newline)" : "Create or select a session to start chatting",
            disabled: !sessionId || streaming,
            rows: 2,
            className: "flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50",
            style: { minHeight: "44px", maxHeight: "120px" }
          }),
          React.createElement(Button, {
            onClick: handleSend,
            disabled: !sessionId || streaming || !input.trim(),
            className: "self-end"
          }, streaming ? "..." : "Send")
        )
      )
    );
  }

  // =========================================================================
  // Tab: Sessions
  // =========================================================================
  function SessionsTab() {
    var sessionsState = useState([]);
    var sessions = sessionsState[0];
    var setSessions = sessionsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];
    var searchState = useState("");
    var search = searchState[0];
    var setSearch = searchState[1];
    var pageState = useState(0);
    var page = pageState[0];
    var setPage = pageState[1];

    var fetchSessions = useCallback(function (q, p) {
      setLoading(true);
      setError(null);
      var fn = q ? api.searchSessions(q, 20) : api.getSessions(20, p * 20);
      fn.then(function (data) {
        setSessions(data.sessions || []);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { fetchSessions("", 0); }, []);

    var handleSearch = useCallback(function () {
      setPage(0);
      fetchSessions(search, 0);
    }, [search, fetchSessions]);

    var handleDelete = useCallback(function (id) {
      api.deleteSession(id).then(function () {
        fetchSessions(search, page);
      }).catch(function (e) {
        setError("Delete failed: " + e.message);
      });
    }, [search, page, fetchSessions]);

    return React.createElement("div", { className: "flex flex-col h-full" },
      React.createElement("div", { className: "flex items-center gap-2 p-4 border-b border-border" },
        React.createElement(Input, {
          value: search,
          onChange: function (e) { setSearch(e.target.value); },
          onKeyDown: function (e) { if (e.key === "Enter") handleSearch(); },
          placeholder: "Search sessions...",
          className: "flex-1"
        }),
        React.createElement(Button, { onClick: handleSearch, variant: "outline" }, "Search"),
        React.createElement(Button, {
          onClick: function () {
            fetchJSON("/api/plugins/hermes-webui/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({})
            }).then(function () { fetchSessions(search, page); })
              .catch(function (e) { setError(e.message); });
          },
          variant: "outline"
        }, "+ New")
      ),

      loading
        ? React.createElement(LoadingSpinner, null)
        : error
          ? React.createElement(ErrorDisplay, { message: error, onRetry: function () { fetchSessions(search, page); } })
          : React.createElement("div", { className: "flex-1 overflow-y-auto" },
              sessions.map(function (s) {
                return React.createElement(Card, { key: s.id, className: "mx-4 mt-2" },
                  React.createElement(CardContent, { className: "py-3" },
                    React.createElement("div", { className: "flex items-center justify-between" },
                      React.createElement("div", { className: "flex-1" },
                        React.createElement("div", { className: "flex items-center gap-2" },
                          React.createElement("span", { className: "text-sm font-medium" }, s.title || s.id),
                          s.is_active
                            ? React.createElement(Badge, { className: "text-xs bg-green-500/10 text-green-400" }, "Active")
                            : null,
                          s.model
                            ? React.createElement(Badge, { className: "text-xs" }, s.model)
                            : null
                        ),
                        React.createElement("div", { className: "flex items-center gap-3 mt-1 text-xs text-muted-foreground" },
                          React.createElement("span", null, timeAgo ? timeAgo(s.last_active) : s.id.slice(0, 8)),
                          React.createElement("span", null, (s.message_count || 0) + " msgs"),
                          React.createElement("span", null, (s.input_tokens || 0) + " tokens")
                        )
                      ),
                      React.createElement(Button, {
                        onClick: function () { handleDelete(s.id); },
                        variant: "ghost",
                        className: "text-xs text-destructive"
                      }, "Delete")
                    ),
                    s.preview
                      ? React.createElement("p", { className: "text-xs text-muted-foreground mt-2 truncate" }, s.preview)
                      : null
                  )
                );
              }),
              sessions.length === 0
                ? React.createElement("p", { className: "text-sm text-muted-foreground text-center py-12" }, "No sessions found")
                : null
            ),

      React.createElement("div", { className: "flex items-center justify-center gap-2 p-4 border-t border-border" },
        React.createElement(Button, {
          onClick: function () { setPage(Math.max(0, page - 1)); fetchSessions(search, page - 1); },
          disabled: page === 0,
          variant: "ghost",
          className: "text-xs"
        }, "Previous"),
        React.createElement("span", { className: "text-xs text-muted-foreground" }, "Page " + (page + 1)),
        React.createElement(Button, {
          onClick: function () { setPage(page + 1); fetchSessions(search, page + 1); },
          disabled: sessions.length < 20,
          variant: "ghost",
          className: "text-xs"
        }, "Next")
      )
    );
  }

  // =========================================================================
  // Tab: Models
  // =========================================================================
  function ModelsTab() {
    var modelInfoState = useState(null);
    var modelInfo = modelInfoState[0];
    var setModelInfo = modelInfoState[1];
    var modelOptionsState = useState([]);
    var modelOptions = modelOptionsState[0];
    var setModelOptions = modelOptionsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    useEffect(function () {
      setLoading(true);
      Promise.all([
        api.getModelInfo().catch(function () { return null; }),
        api.getModelOptions().catch(function () { return { models: [] }; })
      ]).then(function (results) {
        setModelInfo(results[0]);
        setModelOptions(results[1].models || []);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error });

    return React.createElement("div", { className: "p-4 space-y-4" },
      modelInfo
        ? React.createElement(Card, null,
            React.createElement(CardHeader, null,
              React.createElement(CardTitle, null, "Current Model")
            ),
            React.createElement(CardContent, null,
              React.createElement("div", { className: "space-y-2" },
                React.createElement("div", { className: "flex items-center gap-2" },
                  React.createElement("span", { className: "text-sm font-medium" }, "Model:"),
                  React.createElement(Badge, null, modelInfo.model || "default")
                ),
                modelInfo.provider
                  ? React.createElement("div", { className: "flex items-center gap-2" },
                      React.createElement("span", { className: "text-sm font-medium" }, "Provider:"),
                      React.createElement(Badge, { className: "bg-blue-500/10 text-blue-400" }, modelInfo.provider)
                    )
                  : null
              )
            )
          )
        : null,

      React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement(CardTitle, null, "Available Models")
        ),
        React.createElement(CardContent, null,
          React.createElement("div", { className: "space-y-2" },
            modelOptions.length > 0
              ? modelOptions.map(function (m, idx) {
                  return React.createElement("div", {
                    key: "m-" + idx,
                    className: "flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  },
                    React.createElement("span", { className: "text-sm" }, m.id || m.name || m),
                    m.owned_by
                      ? React.createElement(Badge, { className: "text-xs" }, m.owned_by)
                      : null
                  );
                })
              : React.createElement("p", { className: "text-sm text-muted-foreground" }, "No models listed")
          )
        )
      )
    );
  }

  // =========================================================================
  // Tab: Config
  // =========================================================================
  function ConfigTab() {
    var configState = useState(null);
    var config = configState[0];
    var setConfig = configState[1];
    var envVarsState = useState(null);
    var envVars = envVarsState[0];
    var setEnvVars = envVarsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var loadConfig = useCallback(function () {
      setLoading(true);
      Promise.all([
        api.getConfigRaw().catch(function () { return null; }),
        api.getEnvVars().catch(function () { return null; })
      ]).then(function (results) {
        setConfig(results[0]);
        setEnvVars(results[1]);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { loadConfig(); }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error, onRetry: loadConfig });

    return React.createElement("div", { className: "p-4 space-y-4" },
      config
        ? React.createElement(Card, null,
            React.createElement(CardHeader, null,
              React.createElement(CardTitle, null, "Config (config.yaml)")
            ),
            React.createElement(CardContent, null,
              React.createElement("pre", {
                className: "text-xs font-mono bg-muted rounded-lg p-4 overflow-x-auto max-h-96"
              }, config.yaml || "No config loaded")
            )
          )
        : null,

      envVars
        ? React.createElement(Card, null,
            React.createElement(CardHeader, null,
              React.createElement(CardTitle, null, "Environment Variables")
            ),
            React.createElement(CardContent, null,
              React.createElement("div", { className: "space-y-2" },
                Object.keys(envVars).map(function (key) {
                  var v = envVars[key];
                  return React.createElement("div", {
                    key: "env-" + key,
                    className: "flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  },
                    React.createElement("div", null,
                      React.createElement("span", { className: "text-sm font-mono" }, key),
                      v.description
                        ? React.createElement("p", { className: "text-xs text-muted-foreground" }, v.description)
                        : null
                    ),
                    React.createElement(Badge, {
                      className: cn("text-xs", v.is_set ? "bg-green-500/10 text-green-400" : "bg-muted")
                    }, v.is_set ? "Set" : "Not set")
                  );
                })
              )
            )
          )
        : null
    );
  }

  // =========================================================================
  // Tab: Skills
  // =========================================================================
  function SkillsTab() {
    var skillsState = useState([]);
    var skills = skillsState[0];
    var setSkills = skillsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var loadSkills = useCallback(function () {
      setLoading(true);
      api.getSkills().then(function (data) {
        setSkills(data || []);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { loadSkills(); }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error, onRetry: loadSkills });

    return React.createElement("div", { className: "p-4" },
      React.createElement("div", { className: "space-y-2" },
        skills.length > 0
          ? skills.map(function (s, idx) {
              return React.createElement("div", {
                key: "sk-" + idx,
                className: "flex items-center justify-between p-3 rounded-lg bg-muted/50"
              },
                React.createElement("div", null,
                  React.createElement("span", { className: "text-sm font-medium" }, s.name),
                  s.description
                    ? React.createElement("p", { className: "text-xs text-muted-foreground" }, s.description)
                    : null
                ),
                React.createElement(Badge, {
                  className: cn("text-xs", s.enabled ? "bg-green-500/10 text-green-400" : "bg-muted")
                }, s.enabled ? "Enabled" : "Disabled")
              );
            })
          : React.createElement("p", { className: "text-sm text-muted-foreground text-center py-12" }, "No skills found")
      )
    );
  }

  // =========================================================================
  // Tab: Profiles
  // =========================================================================
  function ProfilesTab() {
    var profilesState = useState([]);
    var profiles = profilesState[0];
    var setProfiles = profilesState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var loadProfiles = useCallback(function () {
      setLoading(true);
      api.getProfiles().then(function (data) {
        setProfiles(data.profiles || []);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { loadProfiles(); }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error, onRetry: loadProfiles });

    return React.createElement("div", { className: "p-4" },
      React.createElement("div", { className: "space-y-2" },
        profiles.length > 0
          ? profiles.map(function (p, idx) {
              return React.createElement("div", {
                key: "pr-" + idx,
                className: "flex items-center justify-between p-3 rounded-lg bg-muted/50"
              },
                React.createElement("div", null,
                  React.createElement("span", { className: "text-sm font-medium" }, p.name),
                  p.path
                    ? React.createElement("p", { className: "text-xs text-muted-foreground font-mono" }, p.path)
                    : null
                ),
                p.active
                  ? React.createElement(Badge, { className: "text-xs bg-green-500/10 text-green-400" }, "Active")
                  : null
              );
            })
          : React.createElement("p", { className: "text-sm text-muted-foreground text-center py-12" }, "No profiles found")
      )
    );
  }

  // =========================================================================
  // Tab: Cron
  // =========================================================================
  function CronTab() {
    var jobsState = useState([]);
    var jobs = jobsState[0];
    var setJobs = jobsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var loadJobs = useCallback(function () {
      setLoading(true);
      api.getCronJobs().then(function (data) {
        setJobs(Array.isArray(data) ? data : []);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { loadJobs(); }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error, onRetry: loadJobs });

    return React.createElement("div", { className: "p-4" },
      React.createElement("div", { className: "space-y-2" },
        jobs.length > 0
          ? jobs.map(function (j, idx) {
              return React.createElement(Card, { key: "cj-" + idx, className: "" },
                React.createElement(CardContent, { className: "py-3" },
                  React.createElement("div", { className: "flex items-center justify-between" },
                    React.createElement("div", null,
                      React.createElement("div", { className: "flex items-center gap-2" },
                        React.createElement("span", { className: "text-sm font-medium" }, j.name || j.id || "Job " + idx),
                        j.enabled
                          ? React.createElement(Badge, { className: "text-xs bg-green-500/10 text-green-400" }, "Enabled")
                          : React.createElement(Badge, { className: "text-xs bg-muted" }, "Paused")
                      ),
                      j.schedule
                        ? React.createElement("p", { className: "text-xs text-muted-foreground font-mono mt-1" }, j.schedule)
                        : null
                    ),
                    React.createElement("div", { className: "flex gap-1" },
                      React.createElement(Button, {
                        onClick: function () {
                          var fn = j.enabled ? api.pauseCronJob : api.resumeCronJob;
                          fn(j.id).then(loadJobs).catch(function (e) { setError(e.message); });
                        },
                        variant: "ghost",
                        className: "text-xs"
                      }, j.enabled ? "Pause" : "Resume"),
                      React.createElement(Button, {
                        onClick: function () {
                          api.deleteCronJob(j.id).then(loadJobs).catch(function (e) { setError(e.message); });
                        },
                        variant: "ghost",
                        className: "text-xs text-destructive"
                      }, "Delete")
                    )
                  )
                )
              );
            })
          : React.createElement("p", { className: "text-sm text-muted-foreground text-center py-12" }, "No cron jobs found")
      )
    );
  }

  // =========================================================================
  // Tab: Analytics
  // =========================================================================
  function AnalyticsTab() {
    var analyticsState = useState(null);
    var analytics = analyticsState[0];
    var setAnalytics = analyticsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    useEffect(function () {
      api.getAnalytics(30).then(function (data) {
        setAnalytics(data);
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    if (loading) return React.createElement(LoadingSpinner, null);
    if (error) return React.createElement(ErrorDisplay, { message: error });

    var totals = analytics && analytics.totals ? analytics.totals : {};

    return React.createElement("div", { className: "p-4 space-y-4" },
      React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement(CardTitle, null, "Usage (Last 30 Days)")
        ),
        React.createElement(CardContent, null,
          React.createElement("div", { className: "grid grid-cols-2 gap-4" },
            React.createElement(StatBox, { label: "Sessions", value: String(totals.total_sessions || 0) }),
            React.createElement(StatBox, { label: "API Calls", value: String(totals.total_api_calls || 0) }),
            React.createElement(StatBox, { label: "Input Tokens", value: (totals.total_input || 0).toLocaleString() }),
            React.createElement(StatBox, { label: "Output Tokens", value: (totals.total_output || 0).toLocaleString() }),
            React.createElement(StatBox, { label: "Est. Cost", value: "$" + (totals.total_estimated_cost || 0).toFixed(2) })
          )
        )
      ),

      analytics && analytics.by_model && analytics.by_model.length > 0
        ? React.createElement(Card, null,
            React.createElement(CardHeader, null,
              React.createElement(CardTitle, null, "By Model")
            ),
            React.createElement(CardContent, null,
              React.createElement("div", { className: "space-y-2" },
                analytics.by_model.map(function (m, idx) {
                  return React.createElement("div", {
                    key: "bm-" + idx,
                    className: "flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  },
                    React.createElement("span", { className: "text-sm" }, m.model),
                    React.createElement("div", { className: "flex items-center gap-3 text-xs text-muted-foreground" },
                      React.createElement("span", null, (m.sessions || 0) + " sessions"),
                      React.createElement("span", null, "$" + (m.estimated_cost || 0).toFixed(2))
                    )
                  );
                })
              )
            )
          )
        : null
    );
  }

  function StatBox(props) {
    return React.createElement("div", { className: "p-3 rounded-lg bg-muted/50" },
      React.createElement("div", { className: "text-2xl font-bold" }, props.value),
      React.createElement("div", { className: "text-xs text-muted-foreground mt-1" }, props.label)
    );
  }

  // =========================================================================
  // Tab: Logs
  // =========================================================================
  function LogsTab() {
    var logsState = useState("");
    var logs = logsState[0];
    var setLogs = logsState[1];
    var levelState = useState("ALL");
    var level = levelState[0];
    var setLevel = levelState[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var loadLogs = useCallback(function (lvl) {
      setLoading(true);
      api.getLogs({ lines: 100, level: lvl || "ALL", component: "all" }).then(function (data) {
        setLogs((data.lines || []).join("\n"));
        setLoading(false);
      }).catch(function (e) {
        setError(e.message);
        setLoading(false);
      });
    }, []);

    useEffect(function () { loadLogs("ALL"); }, []);

    return React.createElement("div", { className: "flex flex-col h-full p-4" },
      React.createElement("div", { className: "flex items-center gap-2 mb-4" },
        React.createElement(Select, {
          value: level,
          onChange: function (v) { setLevel(v); loadLogs(v); },
          className: "w-40"
        },
          React.createElement(SelectOption, { value: "ALL" }, "All Levels"),
          React.createElement(SelectOption, { value: "INFO" }, "INFO"),
          React.createElement(SelectOption, { value: "WARNING" }, "WARNING"),
          React.createElement(SelectOption, { value: "ERROR" }, "ERROR")
        ),
        React.createElement(Button, { onClick: function () { loadLogs(level); }, variant: "outline", className: "text-xs" }, "Refresh")
      ),

      loading
        ? React.createElement(LoadingSpinner, null)
        : error
          ? React.createElement(ErrorDisplay, { message: error, onRetry: function () { loadLogs(level); } })
          : React.createElement("pre", {
              className: "flex-1 text-xs font-mono bg-muted rounded-lg p-4 overflow-auto whitespace-pre-wrap"
            }, logs || "No log output")
    );
  }

  // =========================================================================
  // Main WebUIPage — Tabbed Layout
  // =========================================================================
  function WebUIPage() {
    var tabState = useState("chat");
    var activeTab = tabState[0];
    var setActiveTab = tabState[1];

    var tabs = [
      { id: "chat", label: "Chat", icon: "💬" },
      { id: "sessions", label: "Sessions", icon: "📋" },
      { id: "models", label: "Models", icon: "🤖" },
      { id: "config", label: "Config", icon: "⚙️" },
      { id: "skills", label: "Skills", icon: "🔧" },
      { id: "profiles", label: "Profiles", icon: "👤" },
      { id: "cron", label: "Cron", icon: "⏰" },
      { id: "analytics", label: "Analytics", icon: "📊" },
      { id: "logs", label: "Logs", icon: "📜" }
    ];

    return React.createElement("div", { className: "flex flex-col h-full bg-background" },
      // Tab bar
      React.createElement("div", { className: "flex items-center border-b border-border bg-muted/30 px-2 overflow-x-auto" },
        tabs.map(function (tab) {
          return React.createElement("button", {
            key: tab.id,
            onClick: function () { setActiveTab(tab.id); },
            className: cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )
          }, tab.icon + " " + tab.label);
        })
      ),

      // Tab content
      React.createElement("div", { className: "flex-1 overflow-hidden" },
        activeTab === "chat" ? React.createElement(ChatTab, null)
        : activeTab === "sessions" ? React.createElement(SessionsTab, null)
        : activeTab === "models" ? React.createElement(ModelsTab, null)
        : activeTab === "config" ? React.createElement(ConfigTab, null)
        : activeTab === "skills" ? React.createElement(SkillsTab, null)
        : activeTab === "profiles" ? React.createElement(ProfilesTab, null)
        : activeTab === "cron" ? React.createElement(CronTab, null)
        : activeTab === "analytics" ? React.createElement(AnalyticsTab, null)
        : activeTab === "logs" ? React.createElement(LogsTab, null)
        : null
      ),

      // Footer
      React.createElement("div", { className: "flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30" },
        React.createElement("span", { className: "text-xs text-muted-foreground" }, "Hermes WebUI v2.0.0 — Native Dashboard Plugin"),
        React.createElement("span", { className: "text-xs text-muted-foreground" }, activeTab.charAt(0).toUpperCase() + activeTab.slice(1))
      )
    );
  }

  // Register the plugin
  window.__HERMES_PLUGINS__.register("hermes-webui", WebUIPage);

})();
