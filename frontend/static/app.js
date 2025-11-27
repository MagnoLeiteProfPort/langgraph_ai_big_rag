const { useState } = React;

function Sidebar({ current, onSelect }) {
  const menuClasses = (id) =>
    "block w-full text-left px-4 py-2 rounded-xl mb-2 " +
    (current === id
      ? "bg-indigo-500 text-white"
      : "bg-slate-800 text-slate-200 hover:bg-slate-700");

  return (
    <div className="w-64 p-4 border-r border-slate-800 h-screen">
      <h1 className="text-2xl font-bold mb-6">BIG Console</h1>
      <div className="mb-4">
        <div className="text-xs uppercase text-slate-400 mb-2">Ideas</div>
        <button className={menuClasses("ideas")} onClick={() => onSelect("ideas")}>
          Ideas
        </button>
      </div>
      <div>
        <div className="text-xs uppercase text-slate-400 mb-2">RAG</div>
        <button className={menuClasses("rag-embed")} onClick={() => onSelect("rag-embed")}>
          Perform embeddings
        </button>
        <button className={menuClasses("rag-search")} onClick={() => onSelect("rag-search")}>
          Search
        </button>
      </div>
    </div>
  );
}

function IdeasPage() {
  const [selected, setSelected] = useState("business");

  const tabClasses = (id) =>
    "px-4 py-2 rounded-full text-sm mr-2 mb-2 " +
    (selected === id ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700");

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Ideas</h2>
      <div className="mb-4">
        <button className={tabClasses("business")} onClick={() => setSelected("business")}>
          Business Ideas
        </button>
        <button className={tabClasses("product")} onClick={() => setSelected("product")}>
          Product Ideas
        </button>
        <button className={tabClasses("other")} onClick={() => setSelected("other")}>
          Other Ideas
        </button>
      </div>
      <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
        <p className="text-slate-300">
          This panel will connect to your existing BIG idea generation flows.
          For now, it&apos;s a placeholder separating Business / Product / Other ideas.
        </p>
      </div>
    </div>
  );
}

function EmbeddingsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const runEmbedding = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(window.RAG_API_BASE + "/rag/embed", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Embed request failed");
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
      setStatus({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Perform embeddings</h2>
      <p className="text-slate-300 mb-4">
        This will scan the configured runs folder, detect new/changed/deleted files,
        and update the vector database. Only deltas are embedded.
      </p>
      <button
        onClick={runEmbedding}
        disabled={loading}
        className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? "Running..." : "Run embed delta"}
      </button>

      {status && (
        <div className="mt-4 bg-slate-800 rounded-2xl p-4 border border-slate-700 text-sm">
          {status.error ? (
            <p className="text-red-400">Error: {status.error}</p>
          ) : (
            <ul className="space-y-1">
              <li>Indexed documents: {status.indexed_documents}</li>
              <li>New files: {status.new_files}</li>
              <li>Updated files: {status.updated_files}</li>
              <li>Deleted files: {status.deleted_files}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  const runSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setAnswer(null);
    try {
      const params = new URLSearchParams({ q: query, with_answer: "true" });
      const res = await fetch(window.RAG_API_BASE + "/rag/search?" + params.toString());
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Search failed");
      }
      const data = await res.json();
      setResults(data.results || []);
      setAnswer(data.answer || null);
    } catch (err) {
      console.error(err);
      setResults([]);
      setAnswer("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <h2 className="text-xl font-semibold mb-4">RAG Search</h2>
      <form onSubmit={runSearch} className="mb-4 flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
          placeholder="Ask anything about your BIG runs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {answer && (
        <div className="mb-4 bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <h3 className="font-semibold mb-2">Answer</h3>
          <p className="text-slate-200 whitespace-pre-wrap text-sm">{answer}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Documents</h3>
        {results.length === 0 && !loading && (
          <p className="text-slate-500 text-sm">No results yet. Try a query.</p>
        )}
        <div className="space-y-3">
          {results.map((r, idx) => (
            <div
              key={idx}
              className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-sm"
            >
              <div className="flex justify-between items-center mb-1">
                <div className="font-semibold">{r.file_name}</div>
                <div className="text-xs text-slate-400">{r.modified_at || r.created_at}</div>
              </div>
              <div className="text-xs text-slate-500 mb-1">{r.file_path}</div>
              <p className="text-slate-200">{r.snippet}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [current, setCurrent] = useState("ideas");

  let content = null;
  if (current === "ideas") content = <IdeasPage />;
  if (current === "rag-embed") content = <EmbeddingsPage />;
  if (current === "rag-search") content = <SearchPage />;

  return (
    <div className="flex">
      <Sidebar current={current} onSelect={setCurrent} />
      <div className="flex-1">{content}</div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
