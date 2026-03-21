import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Download, 
  Package, 
  Settings, 
  Search, 
  ChevronRight, 
  Plus, 
  Globe,
  Loader2,
  ExternalLink,
  Trash2,
  FileJson,
  FileSpreadsheet,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Edit,
  CheckSquare,
  Square,
  MoreHorizontal,
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Save,
  ChevronDown,
  ChevronUp,
  Upload,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './utils';

interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  marketPrice: string;
  inventory: number;
  image?: string;
  options: string[]; // Values in order of options
}

interface ProductOption {
  name: string;
  values: string[];
}

interface CollectedProduct {
  id: string;
  title: string;
  description: string;
  image: string;
  price: string; // Sale price
  marketPrice: string;
  url: string;
  timestamp: number;
  productType: string;
  sku: string;
  inventory: number;
  purchasePrice: string;
  tags: string[];
  
  // New fields from screenshots
  status: string;
  subtitle: string;
  handle: string;
  supplier: string;
  supplierName: string;
  supplierLink: string;
  carouselImages: string[];
  options: ProductOption[];
  variants: ProductVariant[];
}

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any, 
  label: string, 
  active?: boolean, 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center w-full gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg group",
      active 
        ? "bg-indigo-50 text-indigo-600" 
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
    <span>{label}</span>
    {active && (
      <motion.div 
        layoutId="active-pill"
        className="w-1 h-5 ml-auto bg-indigo-600 rounded-full"
      />
    )}
  </button>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('collect');
  const [url, setUrl] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectType, setCollectType] = useState<'single' | 'series'>('single');
  const [products, setProducts] = useState<CollectedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [jumpPage, setJumpPage] = useState('1');

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [editingProduct, setEditingProduct] = useState<CollectedProduct | null>(null);
  const [batchEditType, setBatchEditType] = useState<'marketPrice' | 'salePrice' | 'tags' | null>(null);
  const [batchEditValue, setBatchEditValue] = useState('');

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsCollecting(true);
    setError(null);

    try {
      const endpoint = collectType === 'single' ? '/api/collect' : '/api/collect-series';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (result.success) {
        if (collectType === 'single') {
          const newProduct: CollectedProduct = {
            ...result.data,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            title: result.data.title || '未命名产品',
            price: result.data.price || '0.00',
            marketPrice: result.data.price || '0.00',
            productType: result.data.type || '未分类',
            sku: 'SKU-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
            inventory: 1000,
            purchasePrice: '0.00',
            tags: result.data.tags || [],
          };
          setProducts([newProduct, ...products]);
        } else {
          const newProducts: CollectedProduct[] = result.data.map((p: any) => ({
            ...p,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            title: p.title || '未命名产品',
            price: p.price || '0.00',
            marketPrice: p.price || '0.00',
            productType: p.type || '未分类',
            sku: 'SKU-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
            inventory: 1000,
            purchasePrice: '0.00',
            tags: p.tags || [],
          }));
          setProducts([...newProducts, ...products]);
        }
        setUrl('');
      } else {
        setError(result.error || '采集产品失败');
      }
    } catch (err) {
      setError('连接服务器时发生错误。');
    } finally {
      setIsCollecting(false);
    }
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
    const newSelected = new Set(selectedIds);
    newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const batchDelete = () => {
    if (selectedIds.size === 0) return;
    setProducts(products.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length) {
      const newSelected = new Set(selectedIds);
      paginatedProducts.forEach(p => newSelected.delete(p.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      paginatedProducts.forEach(p => newSelected.add(p.id));
      setSelectedIds(newSelected);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchUpdate = () => {
    if (!batchEditType || selectedIds.size === 0) return;
    
    setProducts(products.map(p => {
      if (selectedIds.has(p.id)) {
        if (batchEditType === 'marketPrice') return { ...p, marketPrice: batchEditValue };
        if (batchEditType === 'salePrice') return { ...p, price: batchEditValue };
        if (batchEditType === 'tags') return { ...p, tags: batchEditValue.split(',').map(t => t.trim()).filter(t => t) };
      }
      return p;
    }));
    
    setBatchEditType(null);
    setBatchEditValue('');
  };

  const generateVariants = (options: ProductOption[]) => {
    if (options.length === 0 || options.every(o => o.values.length === 0)) return [];
    
    const activeOptions = options.filter(o => o.values.length > 0);
    if (activeOptions.length === 0) return [];

    const combinations: string[][] = [[]];
    
    for (const option of activeOptions) {
      const newCombinations: string[][] = [];
      for (const combination of combinations) {
        for (const value of option.values) {
          newCombinations.push([...combination, value]);
        }
      }
      combinations.splice(0, combinations.length, ...newCombinations);
    }
    
    return combinations.map((combo, index) => ({
      id: `v-${Date.now()}-${index}`,
      title: combo.join(' / '),
      sku: "",
      price: editingProduct?.price || "0.00",
      marketPrice: editingProduct?.marketPrice || "0.00",
      inventory: 1000,
      options: combo
    }));
  };

  const updateOptions = (newOptions: ProductOption[]) => {
    if (!editingProduct) return;
    const newVariants = generateVariants(newOptions);
    setEditingProduct({
      ...editingProduct,
      options: newOptions,
      variants: newVariants
    });
  };

  const addOptionGroup = () => {
    if (!editingProduct) return;
    const newOptions = [...(editingProduct.options || []), { name: "新规格", values: [] }];
    updateOptions(newOptions);
  };

  const removeOptionGroup = (index: number) => {
    if (!editingProduct) return;
    const newOptions = editingProduct.options.filter((_, i) => i !== index);
    updateOptions(newOptions);
  };

  const addOptionValue = (groupIndex: number, value: string) => {
    if (!editingProduct || !value.trim()) return;
    const newOptions = [...editingProduct.options];
    if (newOptions[groupIndex].values.includes(value.trim())) return;
    newOptions[groupIndex].values = [...newOptions[groupIndex].values, value.trim()];
    updateOptions(newOptions);
  };

  const removeOptionValue = (groupIndex: number, valueIndex: number) => {
    if (!editingProduct) return;
    const newOptions = [...editingProduct.options];
    newOptions[groupIndex].values = newOptions[groupIndex].values.filter((_, i) => i !== valueIndex);
    updateOptions(newOptions);
  };

  const handleUpdateProduct = (updated: CollectedProduct) => {
    setProducts(products.map(p => p.id === updated.id ? updated : p));
    setEditingProduct(null);
  };

  // Pagination Logic
  const totalItems = products.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleJumpPage = () => {
    const page = parseInt(jumpPage);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const exportToJSON = () => {
    if (products.length === 0) return;
    const dataStr = JSON.stringify(products, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `shopns_products_${new Date().getTime()}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const exportToCSV = () => {
    if (products.length === 0) return;
    const headers = ['ID', 'Title', 'Price', 'URL', 'Description', 'Timestamp'];
    const rows = products.map(p => [
      p.id,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.price.replace(/"/g, '""')}"`,
      p.url,
      `"${p.description.replace(/"/g, '""')}"`,
      new Date(p.timestamp).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `shopns_products_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Download className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">ShopNS</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="控制面板" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={Download} 
            label="采集任务" 
            active={activeTab === 'collect'} 
            onClick={() => setActiveTab('collect')} 
          />
          <SidebarItem 
            icon={Package} 
            label="已采集产品" 
            active={activeTab === 'products'} 
            onClick={() => setActiveTab('products')} 
          />
          <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            系统管理
          </div>
          <SidebarItem 
            icon={Settings} 
            label="系统设置" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Demo User</p>
              <p className="text-xs text-slate-500 truncate">demo@shopns.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">
              {activeTab === 'collect' && "新增采集任务"}
              {activeTab === 'products' && "已采集产品列表"}
              {activeTab === 'dashboard' && "数据概览"}
              {activeTab === 'settings' && "系统设置"}
            </h2>
            {activeTab === 'products' && products.length > 0 && (
              <div className="flex items-center gap-2 ml-4">
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  导出 Shopify CSV
                </button>
                <button 
                  onClick={exportToJSON}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  导出 WooCommerce
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索任务..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
              />
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-600">
              <Globe className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'collect' && (
              <motion.div
                key="collect"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                  <h3 className="text-2xl font-bold mb-2">采集产品数据</h3>
                  <p className="text-slate-500 mb-8">输入任何电商网站的产品 URL，即可自动提取详细信息。</p>
                  
                  <div className="flex gap-4 mb-6">
                    <button 
                      onClick={() => setCollectType('single')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        collectType === 'single' 
                          ? "bg-indigo-600 text-white shadow-md" 
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      单品采集
                    </button>
                    <button 
                      onClick={() => setCollectType('series')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        collectType === 'series' 
                          ? "bg-indigo-600 text-white shadow-md" 
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      系列采集 (批量)
                    </button>
                  </div>

                  <form onSubmit={handleCollect} className="space-y-4">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        required
                        placeholder={collectType === 'single' ? "请输入产品链接，例如：https://example.com/product/123" : "请输入系列/分类链接，例如：https://example.com/category/shoes"}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      />
                      <button
                        type="submit"
                        disabled={isCollecting}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      >
                        {isCollecting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            正在采集...
                          </>
                        ) : (
                          <>
                            <Plus className="w-5 h-5" />
                            开始采集
                          </>
                        )}
                      </button>
                    </div>
                    {error && (
                      <p className="text-red-500 text-sm mt-2">{error}</p>
                    )}
                  </form>

                  <div className="mt-12 grid grid-cols-3 gap-6">
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                      <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center mb-4">
                        <Globe className="text-white w-5 h-5" />
                      </div>
                      <h4 className="font-semibold mb-1">多平台支持</h4>
                      <p className="text-xs text-slate-500">支持 Amazon, eBay, Shopify 等主流平台。</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center mb-4">
                        <Package className="text-white w-5 h-5" />
                      </div>
                      <h4 className="font-semibold mb-1">自动解析</h4>
                      <p className="text-xs text-slate-500">自动提取图片、价格、标题和描述。</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                      <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center mb-4">
                        <Download className="text-white w-5 h-5" />
                      </div>
                      <h4 className="font-semibold mb-1">批量导出</h4>
                      <p className="text-xs text-slate-500">支持将采集的数据导出为 CSV 或 JSON 格式。</p>
                    </div>
                  </div>
                </div>

                {products.length > 0 && (
                  <div className="mt-12">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold">最近采集</h3>
                      <button 
                        onClick={() => setActiveTab('products')}
                        className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1"
                      >
                        查看全部 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      {products.slice(0, 4).map((product) => (
                        <ProductCard key={product.id} product={product} onRemove={removeProduct} />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'products' && (
              <motion.div
                key="products"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col h-full"
              >
                {products.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Package className="text-slate-400 w-10 h-10" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">暂无已采集的产品</h3>
                    <p className="text-slate-500 mt-1">在“采集任务”标签中输入产品链接开始采集。</p>
                    <button 
                      onClick={() => setActiveTab('collect')}
                      className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                    >
                      去采集
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Batch Actions Toolbar */}
                    <div className="flex items-center gap-3 mb-4">
                      <button 
                        onClick={batchDelete}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-slate-200 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        删除
                      </button>
                      <button 
                        onClick={() => setBatchEditType('marketPrice')}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        批量修改 市场价
                      </button>
                      <button 
                        onClick={() => setBatchEditType('salePrice')}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        批量修改 销售价
                      </button>
                      <button 
                        onClick={() => setBatchEditType('tags')}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        批量修改 tags
                      </button>
                    </div>

                    {/* Table Container */}
                    <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
                      <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-12">
                              <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600">
                                {selectedIds.size === paginatedProducts.length && paginatedProducts.length > 0 ? (
                                  <CheckSquare className="w-5 h-5 text-indigo-600" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">商品主图</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">商品名称</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Type</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">市场价</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">销售价</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">库存</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">采购价</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">采集时间</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedProducts.map((product) => (
                            <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-4 py-4">
                                <button onClick={() => toggleSelect(product.id)} className="text-slate-400 hover:text-indigo-600">
                                  {selectedIds.has(product.id) ? (
                                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                                  ) : (
                                    <Square className="w-5 h-5" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-4">
                                <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 relative group/img">
                                  {product.image ? (
                                    <>
                                      <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
                                      {/* Hover Zoom Preview */}
                                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 w-[300px] h-[400px] max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 bg-white z-[100] opacity-0 pointer-events-none group-hover/img:opacity-100 transition-opacity overflow-hidden">
                                        <img src={product.image} alt="" className="w-full h-full object-contain bg-slate-50" referrerPolicy="no-referrer" />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                      <Package className="w-6 h-6" />
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="max-w-[200px] text-sm font-medium text-slate-900 line-clamp-2" title={product.title}>
                                  {product.title}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-600">{product.productType}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{product.marketPrice}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-indigo-600">{product.price}</td>
                              <td className="px-4 py-4 text-sm text-slate-600 font-mono">{product.sku}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{product.inventory}</td>
                              <td className="px-4 py-4 text-sm text-slate-600">{product.purchasePrice}</td>
                              <td className="px-4 py-4 text-sm text-slate-400">
                                {new Date(product.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => setEditingProduct(product)}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-teal-500 rounded hover:bg-teal-600 transition-colors"
                                  >
                                    编辑
                                  </button>
                                  <button 
                                    onClick={() => removeProduct(product.id)}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded hover:bg-orange-600 transition-colors"
                                  >
                                    删除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="mt-6 flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                          <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(1)}
                            className="p-2 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <ChevronsLeft className="w-4 h-4" />
                          </button>
                          <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            className="p-2 hover:bg-slate-50 disabled:opacity-50 border-l border-slate-200"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          
                          <div className="flex items-center border-l border-slate-200">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum = currentPage;
                              if (totalPages <= 5) pageNum = i + 1;
                              else if (currentPage <= 3) pageNum = i + 1;
                              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                              else pageNum = currentPage - 2 + i;

                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={cn(
                                    "px-4 py-2 text-sm font-medium border-r border-slate-200 last:border-r-0 transition-colors",
                                    currentPage === pageNum ? "bg-teal-500 text-white" : "hover:bg-slate-50"
                                  )}
                                >
                                  {pageNum}
                                </button>
                              );
                            })}
                          </div>

                          <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="p-2 hover:bg-slate-50 disabled:opacity-50 border-l border-slate-200"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                            className="p-2 hover:bg-slate-50 disabled:opacity-50 border-l border-slate-200"
                          >
                            <ChevronsRight className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span>到第</span>
                          <input 
                            type="text" 
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            className="w-12 h-9 border border-slate-200 rounded-lg text-center outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <span>页</span>
                          <button 
                            onClick={handleJumpPage}
                            className="px-4 h-9 bg-white border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                          >
                            确定
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm text-slate-600">
                        <span>共 {totalItems} 条</span>
                        <select 
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="h-9 border border-slate-200 rounded-lg px-2 outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          {[20, 50, 100, 200, 300, 500, 1000].map(size => (
                            <option key={size} value={size}>{size} 条/页</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-4 gap-6"
              >
                <StatCard label="总采集数" value={products.length.toString()} trend="+12%" />
                <StatCard label="进行中任务" value="3" trend="稳定" />
                <StatCard label="采集成功率" value="98.2%" trend="+0.5%" />
                <StatCard label="已导出" value="1,240" trend="+240" />
                
                <div className="col-span-4 bg-white p-6 rounded-2xl border border-slate-200 h-64 flex items-center justify-center text-slate-400">
                  采集活动图表占位符
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-2xl bg-white rounded-2xl border border-slate-200 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-lg">系统配置</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">自动导出</p>
                      <p className="text-sm text-slate-500">采集完成后自动导出为 CSV</p>
                    </div>
                    <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">图片优化</p>
                      <p className="text-sm text-slate-500">保存前压缩图片大小</p>
                    </div>
                    <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Batch Edit Modal */}
      {batchEditType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">
                批量修改 {batchEditType === 'marketPrice' ? '市场价' : batchEditType === 'salePrice' ? '销售价' : 'Tags'}
              </h3>
              <button onClick={() => setBatchEditType(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {batchEditType === 'tags' ? '输入标签 (用逗号分隔)' : '输入新价格'}
                </label>
                <input 
                  type="text"
                  value={batchEditValue}
                  onChange={(e) => setBatchEditValue(e.target.value)}
                  placeholder={batchEditType === 'tags' ? "例如: 热销, 新品, 夏季" : "例如: 299.00"}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <p className="text-xs text-slate-500">
                将修改已选中的 {selectedIds.size} 个产品。
              </p>
            </div>

            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => setBatchEditType(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleBatchUpdate}
                className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
              >
                确定修改
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-white/20"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">编辑产品</h3>
                  <p className="text-xs text-slate-500">ID: {editingProduct.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => handleUpdateProduct(editingProduct)}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存修改
                </button>
                <button onClick={() => setEditingProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 ml-2">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Section: Basic Info */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                  <div className="w-2 h-6 bg-indigo-600 rounded-full" />
                  <h4 className="font-bold text-slate-900">基础信息</h4>
                </div>
                
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 md:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">状态</label>
                    <div className="relative">
                      <select 
                        value={editingProduct.status}
                        onChange={(e) => setEditingProduct({ ...editingProduct, status: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer text-sm"
                      >
                        <option value="正常销售">正常销售</option>
                        <option value="下架">下架</option>
                        <option value="预售">预售</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="col-span-12 md:col-span-9">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">商品名称</label>
                    <input 
                      type="text"
                      value={editingProduct.title}
                      onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="输入商品名称"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">商品副标题</label>
                    <input 
                      type="text"
                      value={editingProduct.subtitle}
                      onChange={(e) => setEditingProduct({ ...editingProduct, subtitle: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="输入商品副标题"
                    />
                  </div>

                  <div className="col-span-12 md:col-span-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">商品分类</label>
                    <input 
                      type="text"
                      value={editingProduct.productType}
                      onChange={(e) => setEditingProduct({ ...editingProduct, productType: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="例如: 连衣裙, T恤"
                    />
                  </div>

                  <div className="col-span-12 md:col-span-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">商品Handle</label>
                    <input 
                      type="text"
                      value={editingProduct.handle}
                      onChange={(e) => setEditingProduct({ ...editingProduct, handle: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="URL 别名"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Product Description (Rich Text Simulation) */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                  <div className="w-2 h-6 bg-indigo-600 rounded-full" />
                  <h4 className="font-bold text-slate-900">商品详情</h4>
                </div>
                
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 p-2 flex flex-wrap gap-1">
                    <button className="p-2 hover:bg-white rounded transition-colors"><Bold className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><Italic className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><Underline className="w-4 h-4" /></button>
                    <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
                    <button className="p-2 hover:bg-white rounded transition-colors"><List className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><ListOrdered className="w-4 h-4" /></button>
                    <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
                    <button className="p-2 hover:bg-white rounded transition-colors"><AlignLeft className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><AlignCenter className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><AlignRight className="w-4 h-4" /></button>
                    <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
                    <button className="p-2 hover:bg-white rounded transition-colors"><LinkIcon className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><ImageIcon className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white rounded transition-colors"><Type className="w-4 h-4" /></button>
                    <div className="w-px h-6 bg-slate-200 mx-1 self-center" />
                    <button className="p-2 hover:bg-white rounded transition-colors ml-auto"><Maximize2 className="w-4 h-4" /></button>
                  </div>
                  <textarea 
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    className="w-full h-64 p-4 outline-none resize-none text-sm leading-relaxed"
                    placeholder="输入商品详细描述..."
                  />
                </div>
              </div>

              {/* Section: Variants */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-6 bg-indigo-600 rounded-full" />
                    <h4 className="font-bold text-slate-900">多规格</h4>
                  </div>
                  <button 
                    onClick={addOptionGroup}
                    className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-bold text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    添加规格组
                  </button>
                </div>

                <div className="space-y-6 mb-8">
                  {editingProduct.options?.map((opt, gIdx) => (
                    <div key={gIdx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                      <button 
                        onClick={() => removeOptionGroup(gIdx)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">规格名</label>
                          <input 
                            type="text"
                            value={opt.name}
                            onChange={(e) => {
                              const newOpts = [...editingProduct.options];
                              newOpts[gIdx].name = e.target.value;
                              setEditingProduct({ ...editingProduct, options: newOpts });
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold"
                          />
                        </div>
                        <div className="col-span-9">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">规格值</label>
                          <div className="flex flex-wrap gap-2">
                            {opt.values.map((val, vIdx) => (
                              <span key={vIdx} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium">
                                {val}
                                <button onClick={() => removeOptionValue(gIdx, vIdx)} className="text-slate-400 hover:text-red-500">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            <input 
                              type="text"
                              placeholder="输入并按回车添加"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addOptionValue(gIdx, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }}
                              className="px-3 py-1 bg-white border border-dashed border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {editingProduct.variants?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                          <th className="px-4 py-3 text-left rounded-l-lg">规格</th>
                          <th className="px-4 py-3 text-left">SKU</th>
                          <th className="px-4 py-3 text-left">市场价</th>
                          <th className="px-4 py-3 text-left">销售价</th>
                          <th className="px-4 py-3 text-left">库存</th>
                          <th className="px-4 py-3 text-right rounded-r-lg">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editingProduct.variants.map((variant, vIdx) => (
                          <tr key={vIdx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{variant.title}</td>
                            <td className="px-4 py-3">
                              <input 
                                type="text"
                                value={variant.sku}
                                onChange={(e) => {
                                  const newVariants = [...editingProduct.variants];
                                  newVariants[vIdx].sku = e.target.value;
                                  setEditingProduct({ ...editingProduct, variants: newVariants });
                                }}
                                className="w-24 px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-xs"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input 
                                type="text"
                                value={variant.marketPrice}
                                onChange={(e) => {
                                  const newVariants = [...editingProduct.variants];
                                  newVariants[vIdx].marketPrice = e.target.value;
                                  setEditingProduct({ ...editingProduct, variants: newVariants });
                                }}
                                className="w-20 px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-xs"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input 
                                type="text"
                                value={variant.price}
                                onChange={(e) => {
                                  const newVariants = [...editingProduct.variants];
                                  newVariants[vIdx].price = e.target.value;
                                  setEditingProduct({ ...editingProduct, variants: newVariants });
                                }}
                                className="w-20 px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-bold text-indigo-600"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input 
                                type="number"
                                value={variant.inventory}
                                onChange={(e) => {
                                  const newVariants = [...editingProduct.variants];
                                  newVariants[vIdx].inventory = parseInt(e.target.value) || 0;
                                  setEditingProduct({ ...editingProduct, variants: newVariants });
                                }}
                                className="w-20 px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-xs"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section: Carousel Images */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                  <div className="w-2 h-6 bg-indigo-600 rounded-full" />
                  <h4 className="font-bold text-slate-900">轮播图</h4>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                  {editingProduct.carouselImages?.map((img, idx) => (
                    <div key={idx} className="aspect-square bg-slate-100 rounded-xl border border-slate-200 relative group overflow-hidden">
                      <img 
                        src={img} 
                        alt={`Carousel ${idx}`} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => {
                            const newImgs = editingProduct.carouselImages.filter((_, i) => i !== idx);
                            setEditingProduct({ ...editingProduct, carouselImages: newImgs });
                          }}
                          className="p-1.5 bg-white rounded-full text-red-600 hover:bg-red-50 shadow-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {idx === 0 && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-md shadow-sm">
                          主图
                        </div>
                      )}
                    </div>
                  ))}
                  <button className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                    <Upload className="w-6 h-6" />
                    <span className="text-xs font-bold">上传图片</span>
                  </button>
                </div>
              </div>

              {/* Section: Supplier Info */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                  <div className="w-2 h-6 bg-indigo-600 rounded-full" />
                  <h4 className="font-bold text-slate-900">供应商信息</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">供应商</label>
                    <input 
                      type="text"
                      value={editingProduct.supplier}
                      onChange={(e) => setEditingProduct({ ...editingProduct, supplier: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="供应商 ID"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">供应商名称</label>
                    <input 
                      type="text"
                      value={editingProduct.supplierName}
                      onChange={(e) => setEditingProduct({ ...editingProduct, supplierName: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="供应商名称"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">供应商链接</label>
                    <input 
                      type="text"
                      value={editingProduct.supplierLink}
                      onChange={(e) => setEditingProduct({ ...editingProduct, supplierLink: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: CollectedProduct;
  onRemove: (id: string) => void;
  key?: React.Key;
}

const ProductCard = ({ product, onRemove }: ProductCardProps) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group"
  >
    <div className="aspect-video bg-slate-100 relative overflow-hidden">
      {product.image ? (
        <img 
          src={product.image} 
          alt={product.title} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-300">
          <Package className="w-12 h-12" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <a 
          href={product.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-2 bg-white rounded-full text-slate-900 hover:bg-slate-100"
        >
          <ExternalLink className="w-5 h-5" />
        </a>
        <button 
          onClick={() => onRemove(product.id)}
          className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
    <div className="p-4">
      <div className="flex justify-between items-start gap-2 mb-2">
        <h4 className="font-bold text-sm line-clamp-2 flex-1">{product.title}</h4>
        <span className="text-indigo-600 font-bold text-sm whitespace-nowrap">{product.price || '暂无价格'}</span>
      </div>
      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{product.description}</p>
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
        <span>采集于 {new Date(product.timestamp).toLocaleDateString()}</span>
        <span className="px-2 py-0.5 bg-slate-100 rounded-full uppercase tracking-wider">有效</span>
      </div>
    </div>
  </motion.div>
);

const StatCard = ({ label, value, trend }: { label: string, value: string, trend: string }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200">
    <p className="text-sm text-slate-500 mb-1">{label}</p>
    <div className="flex items-end gap-2">
      <h4 className="text-2xl font-bold">{value}</h4>
      <span className={cn(
        "text-xs font-medium mb-1",
        trend.startsWith('+') ? "text-emerald-600" : "text-slate-400"
      )}>
        {trend}
      </span>
    </div>
  </div>
);
