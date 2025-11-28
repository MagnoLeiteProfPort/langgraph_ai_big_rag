(function () {
  const { useState } = React;

  const RAG_API_BASE = window.RAG_API_BASE || "http://localhost:8009";

  // Templates for idea subject (guidance for the human prompt)
  const IDEA_TEMPLATES = {
    business:
      "Describe the BUSINESS opportunity you want to explore.\n\n" +
      "You can include, for example:\n" +
      "- Who is the target customer?\n" +
      "- Which problem or pain point do you want to solve?\n" +
      "- Geography or market focus (e.g. Switzerland, EU, global).\n" +
      "- Constraints: budget, team, timeline, tech stack.\n\n" +
      "Write in natural language.",
    product:
      "Describe the PRODUCT idea you want to explore.\n\n" +
      "You can include, for example:\n" +
      "- User persona and their context.\n" +
      "- Core problem / job-to-be-done.\n" +
      "- Must-have features and platforms (web, mobile, API…).\n" +
      "- Integration needs and constraints (time, budget, tech).\n\n" +
      "Write in natural language.",
    other:
      "Describe ANY OTHER type of opportunity or idea you want to explore.\n\n" +
      "You can include, for example:\n" +
      "- Context and goal (research direction, strategy question, innovation area…).\n" +
      "- Key constraints or hypotheses.\n" +
      "- What you want the agents to prioritize (risk, speed, differentiation, etc.).\n\n" +
      "Write in natural language.",
  };

  // Small animated loading indicator with three dots
  function LoadingDots(props) {
    const label = props.label || "";
    return React.createElement(
      "span",
      { className: "loading-dots" },
      label,
      React.createElement("span", { className: "dot dot-1" }, "."),
      React.createElement("span", { className: "dot dot-2" }, "."),
      React.createElement("span", { className: "dot dot-3" }, ".")
    );
  }

  function App() {
    const [section, setSection] = useState("ideas"); // "ideas" | "rag"
    const [ragTab, setRagTab] = useState("embed"); // "embed" | "search"

    // --- Ideas / Agent A state ---
    const [ideaType, setIdeaType] = useState("business"); // "business" | "product" | "other"
    const [ideaSubject, setIdeaSubject] = useState(IDEA_TEMPLATES.business);
    const [ideaCountry, setIdeaCountry] = useState("");
    const [ideaBudget, setIdeaBudget] = useState("");
    const [ideaLoading, setIdeaLoading] = useState(false);
    const [ideaResponse, setIdeaResponse] = useState("");
    const [ideaError, setIdeaError] = useState("");

    // --- RAG state ---
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

    const [editContent, setEditContent] = useState("");

    const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }

    function showToast(message, type) {
      setToast({ message: message, type: type || "success" });
      setTimeout(function () {
        setToast(null);
      }, 3000);
    }

    // ----------------- IDEAS / AGENT A LOGIC -----------------

    function handleIdeaTypeClick(type) {
      setIdeaType(type);
      setIdeaError("");
      setIdeaResponse("");
      setIdeaSubject(IDEA_TEMPLATES[type] || "");
    }

    async function handleIdeaSubmit(e) {
      e.preventDefault();
      setIdeaError("");
      setIdeaResponse("");

      const subject = (ideaSubject || "").trim();
      const country = (ideaCountry || "").trim();
      const budgetRaw = (ideaBudget || "").trim();

      if (!subject) {
        setIdeaError(
          "Please fill in SUBJECT (COUNTRY and BUDGET are optional)."
        );
        return;
      }

      let parsedBudget = null;
      if (budgetRaw === "") {
        parsedBudget = null;
      } else {
        parsedBudget = Number(budgetRaw);
        if (Number.isNaN(parsedBudget)) {
          setIdeaError("Budget must be a valid number (or leave it empty).");
          return;
        }
      }

      setIdeaLoading(true);

      try {
        const res = await fetch(RAG_API_BASE + "/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: subject,
            country: country || "",
            budget: parsedBudget,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            "Agent A responded with status " +
              res.status +
              ": " +
              text.slice(0, 200)
          );
        }

        const data = await res.json();
        setIdeaResponse(data.result ?? "");
      } catch (err) {
        console.error(err);
        setIdeaError(err.message || "Unexpected error calling Agent A.");
        showToast(err.message || "Unexpected error calling Agent A.", "error");
      } finally {
        setIdeaLoading(false);
      }
    }

    // ----------------- RAG LOGIC -----------------

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
        const msg = err.message || "Failed to run embeddings";
        setEmbedError(msg);
        showToast(msg, "error");
      } finally {
        setEmbedLoading(false);
      }
    }

    async function runSearch() {
      const q = (searchQuery || "").trim();
      if (!q) {
        const msg = "Please enter a query.";
        setSearchError(msg);
        showToast(msg, "error");
        return;
      }

      setSearchLoading(true);
      setSearchError(null);
      setAnswer("");
      setSearchResults([]);
      setSelectedDoc(null);
      setDocError(null);
      setEditContent("");

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
        const msg = err.message || "Failed to run search";
        setSearchError(msg);
        showToast(msg, "error");
      } finally {
        setSearchLoading(false);
      }
    }

    async function openDocument(filePath) {
      if (!filePath) return;
      setDocLoading(true);
      setDocError(null);
      setSelectedDoc(null);
      setEditContent("");

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
        setEditContent(data.content || "");
      } catch (err) {
        console.error(err);
        const msg = err.message || "Failed to load document";
        setDocError(msg);
        showToast(msg, "error");
      } finally {
        setDocLoading(false);
      }
    }

    async function saveDocument() {
      if (!selectedDoc) return;
      const content = editContent || "";

      setDocLoading(true);
      setDocError(null);

      try {
        const url = RAG_API_BASE + "/rag/document/save";
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_path: selectedDoc.file_path,
            content: content,
          }),
        });
        if (!res.ok) {
          throw new Error("Save request failed with status " + res.status);
        }
        const data = await res.json();
        // data is the new version DocumentContent
        setSelectedDoc(data);
        setEditContent(data.content || "");
        showToast("New version saved successfully.", "success");
      } catch (err) {
        console.error(err);
        const msg = err.message || "Failed to save document";
        setDocError(msg);
        showToast(msg, "error");
      } finally {
        setDocLoading(false);
      }
    }

    function exportDocument(format) {
      if (!selectedDoc) return;
      const fp = selectedDoc.file_path;
      const url =
        RAG_API_BASE +
        "/rag/document/export?file_path=" +
        encodeURIComponent(fp) +
        "&format=" +
        encodeURIComponent(format);

      window.open(url, "_blank");
    }

    // ----------------- RENDER: IDEAS (Agent A UI) -----------------

    function renderIdeas() {
      return React.createElement(
        "div",
        { className: "main-content" },
        // Header
        React.createElement(
          "header",
          { className: "ideas-header" },
          React.createElement(
            "div",
            { className: "idea-badge" },
            React.createElement("span", null, "🧠"),
            React.createElement("span", null, "Agent A Orchestrator")
          ),
          React.createElement(
            "h2",
            { className: "section-title idea-title" },
            "AI Agentic Explorer"
          ),
          React.createElement(
            "p",
            { className: "idea-subtitle" },
            "SUBJECT is required. COUNTRY and BUDGET are optional. Agent A will derive axes of exploration, call downstream agents, and summarize the most promising ideas for you."
          ),
          // Idea type selector
          React.createElement(
            "div",
            { className: "idea-type-row" },
            React.createElement(
              "button",
              {
                className:
                  "idea-type-btn " +
                  (ideaType === "business" ? "idea-type-btn-active" : ""),
                type: "button",
                onClick: function () {
                  handleIdeaTypeClick("business");
                },
              },
              "Business Ideas"
            ),
            React.createElement(
              "button",
              {
                className:
                  "idea-type-btn " +
                  (ideaType === "product" ? "idea-type-btn-active" : ""),
                type: "button",
                onClick: function () {
                  handleIdeaTypeClick("product");
                },
              },
              "Product Ideas"
            ),
            React.createElement(
              "button",
              {
                className:
                  "idea-type-btn " +
                  (ideaType === "other" ? "idea-type-btn-active" : ""),
                type: "button",
                onClick: function () {
                  handleIdeaTypeClick("other");
                },
              },
              "Other Ideas"
            )
          )
        ),
        // Form card
        React.createElement(
          "div",
          { className: "card" },
          React.createElement(
            "form",
            {
              onSubmit: function (e) {
                handleIdeaSubmit(e);
              },
            },
            React.createElement(
              "div",
              { className: "idea-form-grid" },
              // SUBJECT
              React.createElement(
                "div",
                null,
                React.createElement(
                  "div",
                  { className: "field-label" },
                  "Subject *"
                ),
                React.createElement("textarea", {
                  className: "textarea",
                  rows: 4,
                  placeholder:
                    "Describe the business / product / opportunity you want to explore…",
                  value: ideaSubject,
                  onChange: function (e) {
                    setIdeaSubject(e.target.value);
                  },
                })
              ),
              // COUNTRY
              React.createElement(
                "div",
                null,
                React.createElement(
                  "div",
                  { className: "field-label" },
                  "Country (optional)"
                ),
                React.createElement("input", {
                  className: "input",
                  placeholder: "e.g. Switzerland",
                  value: ideaCountry,
                  onChange: function (e) {
                    setIdeaCountry(e.target.value);
                  },
                }),
                React.createElement(
                  "div",
                  { className: "chip-row" },
                  React.createElement("span", { className: "chip" }, "Context"),
                  React.createElement(
                    "span",
                    { className: "chip" },
                    "Regulation"
                  ),
                  React.createElement(
                    "span",
                    { className: "chip" },
                    "Market maturity"
                  )
                )
              ),
              // BUDGET
              React.createElement(
                "div",
                null,
                React.createElement(
                  "div",
                  { className: "field-label" },
                  "Budget (optional, USD)"
                ),
                React.createElement("input", {
                  className: "input",
                  type: "number",
                  inputMode: "decimal",
                  step: "any",
                  placeholder: "Leave empty or type a number",
                  value: ideaBudget,
                  onChange: function (e) {
                    setIdeaBudget(e.target.value);
                  },
                }),
                React.createElement(
                  "div",
                  { className: "chip-row" },
                  React.createElement(
                    "span",
                    { className: "chip" },
                    "MVP ≤ 60 days"
                  ),
                  React.createElement(
                    "span",
                    { className: "chip" },
                    "Limited capital"
                  )
                )
              )
            ),
            React.createElement(
              "div",
              { className: "button-row" },
              React.createElement(
                "button",
                {
                  className: "button primary-btn",
                  type: "submit",
                  disabled: ideaLoading,
                },
                ideaLoading
                  ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("span", null, "⏳"),
                      React.createElement(
                        "span",
                        { style: { marginLeft: "0.4rem" } },
                        "Generating Ideas..."
                      )
                    )
                  : React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("span", null, "🚀"),
                      React.createElement(
                        "span",
                        { style: { marginLeft: "0.4rem" } },
                        "Generate Ideas"
                      )
                    )
              )
            ),
            ideaError &&
              React.createElement(
                "div",
                { className: "error-text", style: { marginTop: "0.5rem" } },
                "⚠️ ",
                ideaError
              )
          )
        ),
        // Response card
        React.createElement(
          "div",
          { className: "card" },
          React.createElement(
            "div",
            { className: "response-title" },
            "Ideas Generated"
          ),
          ideaLoading &&
            !ideaResponse &&
            React.createElement(
              "p",
              { className: "response-body" },
              "Agents are coordinating the calls..."
            ),
          !ideaLoading &&
            !ideaResponse &&
            !ideaError &&
            React.createElement(
              "p",
              { className: "response-empty" },
              "Results will appear here after you run Generate Ideas."
            ),
          ideaResponse &&
            React.createElement(
              "div",
              { className: "response-body" },
              ideaResponse
            )
        )
      );
    }

    // ----------------- RENDER: RAG -----------------

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
          embedLoading &&
            React.createElement(
              "p",
              { className: "muted small-loading" },
              React.createElement(LoadingDots, { label: "Running embeddings" })
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
      const isDirty =
        selectedDoc && editContent !== (selectedDoc.content || "");

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
          searchLoading &&
            React.createElement(
              "p",
              { className: "muted small-loading" },
              React.createElement(LoadingDots, { label: "Searching" })
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
              "Click on a document name above to view and edit its content here. Every save creates a new version."
            ),
          selectedDoc &&
            !docLoading &&
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "doc-viewer-header-row" },
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
                // Export toolbar
                React.createElement(
                  "div",
                  { className: "export-toolbar" },
                  React.createElement(
                    "span",
                    { className: "export-label" },
                    "Export:"
                  ),
                  React.createElement(
                    "button",
                    {
                      className: "export-btn",
                      onClick: function () {
                        exportDocument("txt");
                      },
                    },
                    "TXT"
                  ),
                  React.createElement(
                    "button",
                    {
                      className: "export-btn",
                      onClick: function () {
                        exportDocument("markdown");
                      },
                    },
                    "MD"
                  ),
                  React.createElement(
                    "button",
                    {
                      className: "export-btn",
                      onClick: function () {
                        exportDocument("pdf");
                      },
                    },
                    "PDF"
                  )
                )
              ),
              React.createElement(
                "p",
                { className: "muted info-edit" },
                "You can edit the document below. When you save, a new version file is created and older versions are kept."
              ),
              React.createElement("textarea", {
                className: "doc-edit-textarea",
                value: editContent,
                onChange: function (e) {
                  setEditContent(e.target.value);
                },
              }),
              React.createElement(
                "div",
                { className: "doc-edit-actions" },
                isDirty &&
                  React.createElement(
                    "button",
                    {
                      className: "primary-btn",
                      onClick: saveDocument,
                      disabled: docLoading,
                    },
                    docLoading ? "Saving..." : "Save new version"
                  ),
                React.createElement(
                  "button",
                  {
                    className: "secondary-btn",
                    onClick: function () {
                      setEditContent(selectedDoc.content || "");
                    },
                    disabled: docLoading || !isDirty,
                  },
                  "Reset changes"
                )
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

    // ----------------- MAIN APP SHELL -----------------

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
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
      ),
      toast &&
        React.createElement(
          "div",
          {
            className:
              "toast " +
              (toast.type === "error" ? "toast-error" : "toast-success"),
          },
          React.createElement(
            "div",
            { className: "toast-message" },
            toast.message
          )
        )
    );
  }

  // Styles
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
  .secondary-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 0.5rem;
    border: 1px solid #374151;
    background: #020617;
    color: #e5e7eb;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .secondary-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .secondary-btn:hover:not(:disabled) {
    background: #111827;
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
  .info-edit {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
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
  .small-loading {
    margin-top: 0.4rem;
    font-size: 0.8rem;
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
  .doc-viewer-header-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .doc-viewer-meta {
    font-size: 0.85rem;
    margin-bottom: 0.3rem;
  }
  .small-path {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .doc-edit-textarea {
    width: 100%;
    min-height: 180px;
    resize: vertical;
    border-radius: 0.5rem;
    border: 1px solid #374151;
    background: #020617;
    color: #e5e7eb;
    padding: 0.5rem 0.75rem;
    font-family: monospace;
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
  .doc-edit-textarea:focus {
    outline: none;
    border-color: #0ea5e9;
  }
  .doc-edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .list {
    padding-left: 1.2rem;
  }

  /* Ideas / Agent A */
  .ideas-header {
    margin-bottom: 1rem;
  }
  .idea-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    background: #020617;
    border: 1px solid #1f2937;
    font-size: 0.8rem;
    color: #e5e7eb;
    margin-bottom: 0.6rem;
  }
  .idea-title {
    margin-bottom: 0.25rem;
  }
  .idea-subtitle {
    font-size: 0.9rem;
    color: #9ca3af;
    max-width: 720px;
    margin-bottom: 0.8rem;
  }
  .idea-type-row {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.25rem;
  }
  .idea-type-btn {
    border-radius: 999px;
    border: 1px solid #1f2937;
    background: #020617;
    color: #9ca3af;
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .idea-type-btn-active {
    background: #0f172a;
    color: #e5e7eb;
    border-color: #38bdf8;
  }
  .idea-form-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1.4fr);
    gap: 1rem;
  }
  @media (max-width: 900px) {
    .idea-form-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .field-label {
    font-size: 0.85rem;
    color: #e5e7eb;
    margin-bottom: 0.25rem;
  }
  .textarea {
    width: 100%;
    border-radius: 0.5rem;
    border: 1px solid #374151;
    background: #020617;
    color: #e5e7eb;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    resize: vertical;
  }
  .textarea:focus {
    outline: none;
    border-color: #0ea5e9;
  }
  .input {
    width: 100%;
    border-radius: 0.5rem;
    border: 1px solid #374151;
    background: #020617;
    color: #e5e7eb;
    padding: 0.4rem 0.7rem;
    font-size: 0.9rem;
  }
  .input:focus {
    outline: none;
    border-color: #0ea5e9;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.3rem;
  }
  .chip {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #0f172a;
    border: 1px solid #1f2937;
    color: #9ca3af;
  }
  .button-row {
    margin-top: 0.9rem;
    display: flex;
    justify-content: flex-end;
  }
  .button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .response-title {
    font-weight: 600;
    margin-bottom: 0.4rem;
  }
  .response-body {
    font-size: 0.9rem;
    color: #e5e7eb;
    white-space: pre-wrap;
  }
  .response-empty {
    font-size: 0.85rem;
    color: #6b7280;
  }

  /* Export toolbar */
  .export-toolbar {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.4rem;
    border-radius: 999px;
    background: #020617;
    border: 1px solid #1f2937;
  }
  .export-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
  }
  .export-btn {
    border: none;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: #0f172a;
    color: #e5e7eb;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .export-btn:hover {
    background: #1d4ed8;
  }

  /* Loading dots animation */
  .loading-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.08rem;
  }
  .loading-dots .dot {
    display: inline-block;
    animation: blink 1.4s infinite both;
  }
  .loading-dots .dot-2 {
    animation-delay: 0.2s;
  }
  .loading-dots .dot-3 {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%, 80%, 100% { opacity: 0; }
    40% { opacity: 1; }
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid #166534;
    background: #14532d;
    color: #ecfdf5;
    box-shadow: 0 10px 25px rgba(0,0,0,0.35);
    z-index: 9999;
    max-width: 320px;
    font-size: 0.85rem;
  }
  .toast-error {
    border-color: #b91c1c;
    background: #7f1d1d;
    color: #fee2e2;
  }
  .toast-message {
    margin: 0;
  }
  `;
  document.head.appendChild(style);

  const rootEl = document.getElementById("root");
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(App));
  }
})();
