/**
 * Hermes WebUI Dashboard Plugin
 *
 * Embeds the classic Hermes WebUI SPA in a full-viewport iframe.
 * No build step needed — plain IIFE using SDK globals.
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const { React } = SDK;
  const { Card, CardContent, Button } = SDK.components;
  const { useState, useEffect, useCallback } = SDK.hooks;

  function WebUIPage() {
    const [state, setState] = useState({ loading: true, error: null, webuiUrl: null, starting: false });

    const fetchConfig = useCallback(function () {
      setState(function (s) { return { ...s, loading: true, error: null }; });
      SDK.fetchJSON("/api/plugins/hermes-webui/config")
        .then(function (config) {
          if (config && config.webui_url) {
            setState({ loading: false, error: null, webuiUrl: config.webui_url, starting: false });
          } else {
            setState({ loading: false, error: "WebUI server is not running.", webuiUrl: null, starting: false });
          }
        })
        .catch(function (err) {
          setState({
            loading: false,
            error: "Could not reach WebUI backend: " + (err && err.message ? err.message : String(err)),
            webuiUrl: null,
            starting: false,
          });
        });
    }, []);

    useEffect(function () {
      fetchConfig();
    }, [fetchConfig]);

    const handleStart = useCallback(function () {
      setState(function (s) { return { ...s, starting: true, error: null }; });
      SDK.fetchJSON("/api/plugins/hermes-webui/start", { method: "POST" })
        .then(function (result) {
          if (result && (result.status === "started" || result.status === "already_running")) {
            setTimeout(fetchConfig, 2000);
          } else {
            setState(function (s) {
              return { ...s, starting: false, error: "Failed to start WebUI: " + ((result && result.message) || "unknown error") };
            });
          }
        })
        .catch(function (err) {
          setState(function (s) {
            return { ...s, starting: false, error: "Failed to start WebUI: " + (err && err.message ? err.message : String(err)) };
          });
        });
    }, [fetchConfig]);

    if (state.loading) {
      return React.createElement("div", {
        className: "flex items-center justify-center h-full text-sm text-muted-foreground",
      }, "Connecting to WebUI...");
    }

    if (state.error || !state.webuiUrl) {
      return React.createElement("div", {
        className: "flex items-center justify-center h-full",
      },
        React.createElement(Card, { className: "max-w-md w-full" },
          React.createElement(CardContent, { className: "flex flex-col gap-4 pt-6" },
            React.createElement("p", { className: "text-sm font-medium" }, "WebUI Unavailable"),
            React.createElement("p", { className: "text-sm text-muted-foreground" },
              state.error || "WebUI server is not running."
            ),
            React.createElement("p", { className: "text-xs text-muted-foreground" },
              "Start it manually: ",
              React.createElement("code", { className: "font-courier" }, "python3 server.py"),
              " — or use the button below."
            ),
            React.createElement(Button, {
              onClick: handleStart,
              disabled: state.starting,
            }, state.starting ? "Starting..." : "Start WebUI Server"),
          ),
        ),
      );
    }

    return React.createElement("iframe", {
      src: state.webuiUrl,
      style: { width: "100%", height: "100%", border: "none", display: "block" },
      title: "Hermes WebUI",
      allow: "fullscreen",
    });
  }

  window.__HERMES_PLUGINS__.register("hermes-webui", WebUIPage);
})();
