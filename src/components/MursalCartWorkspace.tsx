import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  Send,
  ShoppingBag,
} from 'lucide-react';
import { MursalCartEvaluation } from '../types';

interface MursalCartWorkspaceProps {
  onEvaluateCustom?: (product: string) => void;
}

export const MursalCartWorkspace: React.FC<MursalCartWorkspaceProps> = () => {
  const [productName, setProductName] = useState('T900 Ultra Smartwatch Pro');
  const [category, setCategory] = useState('Electronics & Gadgets');
  const [supplierPrice, setSupplierPrice] = useState(1150);
  const [sellingPrice, setSellingPrice] = useState(2499);
  const [shippingCost, setShippingCost] = useState(250);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<MursalCartEvaluation | null>(null);

  // Listing Generator State
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);
  const [listingOutput, setListingOutput] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/jarvis/mursalcart/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          category,
          supplierPrice,
          sellingPrice,
          shippingCost,
        }),
      });
      const data = await res.json();
      setEvaluation(data);
    } catch (e) {
      console.error('Failed to evaluate product:', e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleGenerateListing = async () => {
    setIsGeneratingListing(true);
    try {
      const res = await fetch('/api/jarvis/mursalcart/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          sellingPrice: String(sellingPrice),
        }),
      });
      const data = await res.json();
      setListingOutput(data.listing);
    } catch (e) {
      console.error('Failed to generate listing:', e);
    } finally {
      setIsGeneratingListing(false);
    }
  };

  const handleCopy = () => {
    if (!listingOutput) return;
    navigator.clipboard.writeText(listingOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Initial evaluation on component load
  React.useEffect(() => {
    handleEvaluate();
  }, []);

  return (
    <div id="mursalcart-workspace" className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#141418] border border-[#22222a]">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">MURSALCART™ INTELLIGENCE ENGINE</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#16161c] text-amber-400 border border-[#262632]">
                ALWAYS ON
              </span>
            </div>
            <p className="text-xs text-[#80808a]">
              Automated 12-Metric Evaluation, Pakistani Sourcing Matrix (Markaz/Shah Alam), & High-Conversion Listing Generator.
            </p>
          </div>
        </div>

        <button
          id="btn-generate-full-listing"
          onClick={handleGenerateListing}
          disabled={isGeneratingListing}
          className="px-4 py-2 rounded-lg bg-[#1a1a24] hover:bg-[#252534] border border-[#2e2e40] text-white font-medium text-xs tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          {isGeneratingListing ? 'GENERATING ADS...' : 'GENERATE AD COPY'}
        </button>
      </div>

      {/* Input Form & Financial Modeler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
        <div>
          <label className="block text-xs font-mono text-[#80808a] mb-1">Product Name</label>
          <input
            id="input-product-name"
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[#121216] border border-[#202028] text-white focus:outline-none focus:border-[#383848] font-medium transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-[#80808a] mb-1">Supplier Cost (PKR)</label>
          <input
            id="input-supplier-cost"
            type="number"
            value={supplierPrice}
            onChange={(e) => setSupplierPrice(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[#121216] border border-[#202028] text-white focus:outline-none focus:border-[#383848] font-mono transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-[#80808a] mb-1">Selling Retail (PKR)</label>
          <input
            id="input-selling-price"
            type="number"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[#121216] border border-[#202028] text-white focus:outline-none focus:border-[#383848] font-mono transition-colors"
          />
        </div>

        <div className="flex items-end">
          <button
            id="btn-re-evaluate"
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className="w-full px-4 py-2 rounded-lg bg-[#181822] hover:bg-[#222230] border border-[#2a2a3a] text-white font-medium text-xs tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isEvaluating ? 'EVALUATING...' : 'RUN 12-METRIC AUDIT'}
          </button>
        </div>
      </div>

      {/* Financial Breakdown Badges */}
      {evaluation && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
            <span className="text-[11px] font-mono text-[#80808a]">Gross Margin</span>
            <div className="text-xl font-bold text-white font-mono">
              {evaluation.financials.grossMargin}
            </div>
            <span className="text-[10px] text-[#60606a]">Target &gt; 45% for COD</span>
          </div>

          <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
            <span className="text-[11px] font-mono text-[#80808a]">Gross Profit / Unit</span>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              Rs. {evaluation.financials.grossProfit}
            </div>
            <span className="text-[10px] text-[#60606a]">Retail - (Supply + Ship)</span>
          </div>

          <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
            <span className="text-[11px] font-mono text-[#80808a]">Est. COD Return Rate</span>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {evaluation.financials.estimatedReturnRate}
            </div>
            <span className="text-[10px] text-[#60606a]">Pakistan Industry Benchmark</span>
          </div>

          <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
            <span className="text-[11px] font-mono text-[#80808a]">Overall Viability Score</span>
            <div className="text-xl font-bold text-white font-mono flex items-center gap-1.5">
              <span>{evaluation.overallScore}/100</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#16161c] text-emerald-400 border border-[#22222a] font-normal">
                {evaluation.overallScore >= 80 ? 'WINNER' : 'MODERATE'}
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 truncate block font-mono">
              {evaluation.recommendation}
            </span>
          </div>
        </div>
      )}

      {/* 12-Metric Scorecard Grid */}
      {evaluation && (
        <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <h3 className="text-xs font-mono font-semibold text-white tracking-wider mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            12-METRIC WINNING-PRODUCT SCORECARD
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {evaluation.metrics.map((m, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-[#121216] border border-[#1e1e24]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#e0e0e0] truncate">{m.name}</span>
                  <span
                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                      m.score >= 85
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : m.score >= 70
                        ? 'bg-[#181822] text-[#a0a0b0] border border-[#262636]'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {m.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-[#80808a] leading-relaxed">{m.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pakistani Marketplace Sourcing Channels */}
      {evaluation && (
        <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <h3 className="text-xs font-mono font-semibold text-white tracking-wider mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            PAKISTANI WHOLESALE PROCUREMENT CHANNELS
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {evaluation.pakistaniSourcingChannels.map((channel, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#121216] border border-[#1e1e24]">
                <div className="text-xs font-semibold text-white mb-1">{channel.name}</div>
                <div className="text-xs text-amber-400 font-mono font-semibold">
                  Cost: {channel.estimatedCost}
                </div>
                <div className="text-[11px] text-[#80808a]">
                  Status: {channel.availability} ({channel.deliveryDays})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-Converting Ad Copy & Multi-Platform Output */}
      {listingOutput && (
        <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-mono font-semibold text-white tracking-wider">
                GENERATED AD COPY (FB MARKETPLACE, OLX, INSTAGRAM & WHATSAPP)
              </h3>
            </div>
            <button
              id="btn-copy-ad-copy"
              onClick={handleCopy}
              className="px-3 py-1 rounded bg-[#141418] hover:bg-[#1e1e26] text-[#e0e0e0] text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer border border-[#22222a]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'COPIED!' : 'COPY ALL'}
            </button>
          </div>
          <pre className="text-xs text-[#d0d0d8] font-mono whitespace-pre-wrap max-h-80 overflow-y-auto p-3 rounded-lg bg-[#0a0a0c] border border-[#1e1e24] leading-relaxed">
            {listingOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
