// frontend/static/app.js

(function () {
  const { useState } = React;

  const RAG_API_BASE = window.RAG_API_BASE || "http://localhost:8001";

  function App() {
    const [section, setSection] = useState("ideas"); // "ideas" | "rag"
    const [ragTab, setRagTab] = useState("embed"); // "embed" | "search"

    const [embedStatus, setEmbedStatus] = useState(null);
    const [embedLoading, setEmbedLoading] = useState(false);
    const [embedError, setEmbedError] = useState(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [answer, setAnswer] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const [selectedDoc, setSelectedDoc] = useState(null);
    const [docLoading, setDocLoading] = useState(false);
    const [docError, setDocError] = useState(null);

    async function runEmbedding() {
      setEmbedLoading(true);
      setEmbedError(null);
      setEmbedStatus(null);
      try {
        const res = await fetch(RAG_API_BASE + "/rag/embed", {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error("Embedding request failed with status " + res.status);
        }
        const data = await res.json();
        setEmbedStatus(data);
      } catch (err) {
        console.error(err);
        setEmbedError(err.message || "Failed to run embeddings");
      } finally {
        setEmbedLoading(false);
      }
    }

    async function runSearch() {
      const q = (searchQuery || "").trim();
      if (!q) {
        setSearchError("Please enter a query.");
        return;
      }

      setSearchLoading(true);
      setSearchError(null);
      setAnswer("");
      setSearchResults([]);
      setSelectedDoc(null);
      setDocError(null);

      try {
        const url =
          RAG_API_BASE +
          "/rag/search?q=" +
          encodeURIComponent(q) +
          "&with_answer=true";
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Search request failed with status " + res.status);
        }
        const data = await res.json();
        setAnswer(data.answer || "");
        setSearchResults(data.results || []);
      } catch (err) {
        console.error(err);
        setSearchError(err.message || "Failed to run search");
      } finally {
        setSearchLoading(false);
      }
    }

    async function openDocument(filePath) {
      if (!filePath) return;
      setDocLoading(true);
      setDocError(null);
      setSelectedDoc(null);

      try {
        const url =
          RAG_API_BASE +
          "/rag/document?file_path=" +
          encodeURIComponent(filePath);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Document request failed with status " + res.status);
        }
        const data = await res.json();
        setSelectedDoc(data);
      } catch (err) {
        console.error(err);
        setDocError(err.message || "Failed to load document");
      } finally {
        setDocLoading(false);
      }
    }

    function renderIdeas() {
      return React.createElement(
        "div",
        { className: "main-content" },
        React.createElement("h2", { className: "section-title" }, "Ideas"),
        React.createElement(
          "div",
          { className: "card" },
          React.createElement("h3", null, "Choose idea type"),
          React.createElement(
            "ul",
            { className: "list" },
            React.createElement("li", null, "Business Ideas"),
            React.createElement("li", null, "Product Ideas"),
            React.createElement("li", null, "Other Ideas")
          )
        )
      );
    }

    function renderRagEmbed() {
      return React.createElement(
        "div",
        { className: "main-content" },
        React.createElement(
          "h2",
          { className: "section-title" },
          "RAG – Perform Embeddings"
        ),
        React.createElement(
          "div",
          { className: "card" },
          React.createElement(
            "p",
            null,
            "Run a delta embed over your BIG runs folder. Only new/updated files will be embedded; deleted files will be removed."
          ),
          React.createElement(
            "button",
            {
              className: "primary-btn",
              onClick: runEmbedding,
              disabled: embedLoading,
            },
            embedLoading ? "Running..." : "Run embed delta"
          ),
          embedError &&
            React.createElement("p", { className: "error-text" }, embedError),
          embedStatus &&
            React.createElement(
              "div",
              { className: "status-box" },
              React.createElement(
                "p",
                null,
                "Indexed documents: ",
                embedStatus.indexed_documents
              ),
              React.createElement(
                "p",
                null,
                "New files: ",
                embedStatus.new_files
              ),
              React.createElement(
                "p",
                null,
                "Updated files: ",
                embedStatus.updated_files
              ),
              React.createElement(
                "p",
                null,
                "Deleted files: ",
                embedStatus.deleted_files
              )
            )
        )
      );
    }

    function renderRagSearch() {
      return React.createElement(
        "div",
        { className: "main-content" },
        React.createElement(
          "h2",
          { className: "section-title" },
          "RAG – Search"
        ),
        React.createElement(
          "div",
          { className: "card" },
          React.createElement(
            "div",
            { className: "search-row" },
            React.createElement("input", {
              className: "text-input",
              type: "text",
              placeholder: "Ask about your BIG runs…",
              value: searchQuery,
              onChange: function (e) {
                setSearchQuery(e.target.value);
              },
              onKeyDown: function (e) {
                if (e.key === "Enter") {
                  runSearch();
                }
              },
            }),
            React.createElement(
              "button",
              {
                className: "primary-btn",
                onClick: runSearch,
                disabled: searchLoading,
              },
              searchLoading ? "Searching..." : "Search"
            )
          ),
          searchError &&
            React.createElement("p", { className: "error-text" }, searchError)
        ),
        React.createElement(
          "div",
          { className: "split-layout" },
          // Answer panel
          React.createElement(
            "div",
            { className: "card flex-1" },
            React.createElement("h3", null, "Answer"),
            searchLoading
              ? React.createElement("p", null, "Generating answer...")
              : answer
              ? React.createElement("p", null, answer)
              : React.createElement(
                  "p",
                  { className: "muted" },
                  "No answer yet. Run a search to see an answer here."
                )
          ),
          // Documents panel
          React.createElement(
            "div",
            { className: "card flex-1" },
            React.createElement("h3", null, "Documents"),
            searchResults.length === 0
              ? React.createElement(
                  "p",
                  { className: "muted" },
                  "No documents matched yet."
                )
              : React.createElement(
                  "ul",
                  { className: "doc-list" },
                  searchResults.map(function (r, idx) {
                    return React.createElement(
                      "li",
                      { key: idx, className: "doc-list-item" },
                      React.createElement(
                        "button",
                        {
                          className: "doc-link",
                          onClick: function () {
                            openDocument(r.file_path);
                          },
                          title: r.file_path,
                        },
                        r.file_name || "(no name)"
                      ),
                      React.createElement(
                        "div",
                        { className: "doc-meta" },
                        r.created_at ? "Created: " + r.created_at + " " : "",
                        r.modified_at ? " • Modified: " + r.modified_at : ""
                      ),
                      React.createElement(
                        "div",
                        { className: "doc-snippet" },
                        r.snippet
                      )
                    );
                  })
                )
          )
        ),
        // Document Viewer
        React.createElement(
          "div",
          { className: "card doc-viewer" },
          React.createElement("h3", null, "Document Viewer"),
          docLoading && React.createElement("p", null, "Loading document..."),
          docError &&
            React.createElement("p", { className: "error-text" }, docError),
          !docLoading &&
            !docError &&
            !selectedDoc &&
            React.createElement(
              "p",
              { className: "muted" },
              "Click on a document name above to view its full content here."
            ),
          selectedDoc &&
            !docLoading &&
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "p",
                { className: "doc-viewer-meta" },
                React.createElement("strong", null, selectedDoc.file_name),
                React.createElement("br", null),
                React.createElement(
                  "span",
                  { className: "small-path" },
                  selectedDoc.file_path
                ),
                selectedDoc.created_at
                  ? React.createElement(
                      "span",
                      null,
                      React.createElement("br", null),
                      "Created: ",
                      selectedDoc.created_at
                    )
                  : null,
                selectedDoc.modified_at
                  ? React.createElement(
                      "span",
                      null,
                      React.createElement("br", null),
                      "Modified: ",
                      selectedDoc.modified_at
                    )
                  : null
              ),
              React.createElement(
                "pre",
                { className: "doc-viewer-content" },
                selectedDoc.content
              )
            )
        )
      );
    }

    function renderRag() {
      return React.createElement(
        "div",
        { className: "main-wrapper" },
        React.createElement(
          "div",
          { className: "tabs-row" },
          React.createElement(
            "button",
            {
              className:
                "tab-btn " + (ragTab === "embed" ? "tab-btn-active" : ""),
              onClick: function () {
                setRagTab("embed");
              },
            },
            "Perform embeddings"
          ),
          React.createElement(
            "button",
            {
              className:
                "tab-btn " + (ragTab === "search" ? "tab-btn-active" : ""),
              onClick: function () {
                setRagTab("search");
              },
            },
            "Search"
          )
        ),
        ragTab === "embed" ? renderRagEmbed() : renderRagSearch()
      );
    }

    return React.createElement(
      "div",
      { className: "app-shell" },
      // Sidebar
      React.createElement(
        "aside",
        { className: "sidebar" },
        React.createElement("h1", { className: "logo" }, "BIG Console"),
        React.createElement(
          "nav",
          { className: "nav" },
          React.createElement(
            "button",
            {
              className:
                "nav-item " + (section === "ideas" ? "nav-item-active" : ""),
              onClick: function () {
                setSection("ideas");
              },
            },
            "Ideas"
          ),
          React.createElement(
            "button",
            {
              className:
                "nav-item " + (section === "rag" ? "nav-item-active" : ""),
              onClick: function () {
                setSection("rag");
              },
            },
            "RAG"
          )
        )
      ),
      // Main
      React.createElement(
        "main",
        { className: "main" },
        section === "ideas" ? renderIdeas() : renderRag()
      )
    );
  }

  // Very lightweight styles so it looks reasonable without Tailwind
  const style = document.createElement("style");
  style.innerHTML = `
  .app-shell {
    display: flex;
    min-height: 100vh;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f172a;
    color: #e5e7eb;
  }
  .sidebar {
    width: 220px;
    background: #020617;
    border-right: 1px solid #1f2937;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .logo {
    font-size: 1.4rem;
    font-weight: 700;
    color: #38bdf8;
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .nav-item {
    text-align: left;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
  }
  .nav-item:hover {
    background: #111827;
    color: #e5e7eb;
  }
  .nav-item-active {
    background: #111827;
    color: #e5e7eb;
    border-left: 3px solid #38bdf8;
  }
  .main {
    flex: 1;
    padding: 1.5rem 2rem;
    overflow: auto;
  }
  .main-content {
    max-width: 1200px;
    margin: 0 auto;
  }
  .section-title {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  .card {
    background: #020617;
    border-radius: 0.75rem;
    padding: 1rem 1.2rem;
    border: 1px solid #1f2937;
    margin-bottom: 1rem;
  }
  .primary-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: none;
    background: #0ea5e9;
    color: white;
    cursor: pointer;
    font-weight: 500;
  }
  .primary-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .text-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid #374151;
    background: #020617;
    color: #e5e7eb;
  }
  .text-input:focus {
    outline: none;
    border-color: #0ea5e9;
  }
  .error-text {
    color: #f87171;
    margin-top: 0.5rem;
  }
  .status-box p {
    margin: 0.1rem 0;
  }
  .muted {
    color: #6b7280;
  }
  .tabs-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .tab-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    border: 1px solid #1f2937;
    background: #020617;
    color: #9ca3af;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .tab-btn-active {
    background: #0f172a;
    color: #e5e7eb;
    border-color: #38bdf8;
  }
  .search-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .split-layout {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    margin-bottom: 1rem;
  }
  .flex-1 {
    flex: 1;
  }
  .doc-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    max-height: 260px;
    overflow: auto;
  }
  .doc-list-item {
    padding: 0.4rem 0;
    border-bottom: 1px solid #111827;
  }
  .doc-link {
    background: none;
    border: none;
    color: #38bdf8;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
  }
  .doc-link:hover {
    text-decoration: underline;
  }
  .doc-meta {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .doc-snippet {
    font-size: 0.85rem;
    color: #9ca3af;
  }
  .doc-viewer {
    max-height: 360px;
    overflow: auto;
  }
  .doc-viewer-meta {
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
  .small-path {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .doc-viewer-content {
    margin: 0;
    padding: 0.75rem;
    background: #020617;
    border-radius: 0.5rem;
    border: 1px solid #1f2937;
    font-size: 0.85rem;
    white-space: pre-wrap;
  }
  .list {
    padding-left: 1.2rem;
  }
  `;
  document.head.appendChild(style);

  const rootEl = document.getElementById("root");
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(App));
  }
})();
