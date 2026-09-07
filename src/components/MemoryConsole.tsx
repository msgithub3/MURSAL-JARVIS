import React, { useState, useEffect } from 'react';
import { Database, Plus, RefreshCw, Bookmark, ListTodo, Wrench, MessageSquare } from 'lucide-react';
import { MemoryRecord } from '../types';

export const MemoryConsole: React.FC = () => {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('user_directive');
  const [newType, setNewType] = useState<'long_term' | 'task'>('long_term');
  const [isLoading, setIsLoading] = useState(false);

  const fetchMemory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/jarvis/memory');
      const data = await res.json();
      setMemories(data.memory || []);
    } catch (e) {
      console.error('Failed to fetch memory:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      const res = await fetch('/api/jarvis/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newType,
          category: newCategory,
          content: newContent,
        }),
      });
      const data = await res.json();
      if (data.record) {
        setMemories([data.record, ...memories]);
        setNewContent('');
      }
    } catch (e) {
      console.error('Failed to add memory:', e);
    }
  };

  const filteredMemories =
    selectedType === 'all'
      ? memories
      : memories.filter((m) => m.type === selectedType);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'long_term':
        return <Bookmark className="w-3.5 h-3.5 text-cyan-400" />;
      case 'task':
        return <ListTodo className="w-3.5 h-3.5 text-amber-400" />;
      case 'tool':
        return <Wrench className="w-3.5 h-3.5 text-emerald-400" />;
      case 'short_term':
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div id="memory-console" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#141418] border border-[#22222a]">
            <Database className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">QUAD-TIER MEMORY SYSTEM</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#16161c] text-[#a0a0b0] border border-[#22222a]">
                SHORT-TERM • LONG-TERM • TASK • TOOL
              </span>
            </div>
            <p className="text-xs text-[#80808a]">
              Persistent user preferences, ongoing task queues, e-commerce parameters, and tool telemetry.
            </p>
          </div>
        </div>

        <button
          id="btn-refresh-memory"
          onClick={fetchMemory}
          disabled={isLoading}
          className="px-3.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1e1e26] text-[#e0e0e0] text-xs font-mono flex items-center gap-2 transition-all cursor-pointer border border-[#22222a]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          REFRESH
        </button>
      </div>

      {/* Add Memory Form */}
      <form
        onSubmit={handleAddMemory}
        className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] flex flex-col sm:flex-row gap-3"
      >
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-[#121216] border border-[#202028] text-white text-xs font-mono focus:outline-none focus:border-[#383848]"
        >
          <option value="long_term">Long-Term Memory</option>
          <option value="task">Task Memory</option>
        </select>

        <input
          type="text"
          placeholder="Category (e.g. user_pref, supplier_terms)"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#121216] border border-[#202028] text-white text-xs font-mono focus:outline-none focus:border-[#383848] sm:w-48"
        />

        <input
          type="text"
          placeholder="Memory content or directive to remember permanently..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-[#121216] border border-[#202028] text-white text-xs font-mono focus:outline-none focus:border-[#383848]"
        />

        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-[#181822] hover:bg-[#222230] text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 cursor-pointer border border-[#2a2a3c]"
        >
          <Plus className="w-3.5 h-3.5" />
          SAVE
        </button>
      </form>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 font-mono text-xs overflow-x-auto pb-1">
        {['all', 'short_term', 'long_term', 'task', 'tool'].map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer border ${
              selectedType === type
                ? 'bg-[#181822] text-white border-[#2c2c3e] font-semibold'
                : 'text-[#80808a] hover:text-[#e0e0e0] bg-[#101014] border-transparent'
            }`}
          >
            {type.toUpperCase().replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Memory List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredMemories.map((mem, idx) => (
          <div
            key={`${mem.id}-${idx}`}
            className="p-3 rounded-lg bg-[#0f0f13] border border-[#1e1e24] flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">{getTypeIcon(mem.type)}</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#16161c] text-[#a0a0b0] border border-[#22222a]">
                    {mem.type.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-sky-400">{mem.category}</span>
                </div>
                <p className="text-xs text-[#d0d0d8] leading-relaxed font-sans">{mem.content}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[#60606a] whitespace-nowrap">
              {new Date(mem.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
