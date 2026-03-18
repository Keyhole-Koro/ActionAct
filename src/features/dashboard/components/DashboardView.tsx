import React from 'react';
import { Plus, Clock, Layout } from 'lucide-react';

interface DashboardViewProps {
  onSelectProject: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onSelectProject }) => {
  const projects = [
    { id: 'root', title: '00-GDGoC-Japan-Hackathon-2026', date: '7日前' },
    { id: 'sub-project', title: 'システム構成図案', date: '18日前' },
    { id: 'demo-3', title: '無題のプロジェクト', date: '1ヶ月前' },
  ];

  return (
    // 全体の背景色とスクロール設定
    <div className="w-full h-full bg-[#f9fafb] overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-8 py-12">
        
        {/* ヘッダー：Figma風の配置 */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">最近の表示</h1>
            <div className="flex gap-4 mt-2 text-sm text-slate-500 border-b border-slate-200">
              <span className="border-b-2 border-blue-600 pb-2 text-slate-900 font-medium cursor-pointer">最近のファイル</span>
              <span className="pb-2 cursor-pointer hover:text-slate-700">共有ファイル</span>
              <span className="pb-2 cursor-pointer hover:text-slate-700">共有プロジェクト</span>
            </div>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm text-sm font-medium">
            <Plus size={18} /> 新規作成
          </button>
        </header>

        {/* グリッド：ここで横並びを強制 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {projects.map((p) => (
            <div 
              key={p.id}
              onClick={() => onSelectProject(p.id)}
              className="group flex flex-col cursor-pointer"
            >
              {/* カードのサムネイル部分 */}
              <div className="aspect-[1.6/1] bg-white border border-slate-200 rounded-lg mb-3 flex items-center justify-center group-hover:border-blue-400 group-hover:shadow-md transition-all overflow-hidden">
                {/* Figmaのグレーのプレビューエリアを再現 */}
                <div className="w-full h-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-50/50 transition-colors">
                   <Layout size={32} className="text-slate-200 group-hover:text-blue-200" />
                </div>
              </div>
              
              {/* タイトルとアイコン行 */}
              <div className="flex items-start gap-2 px-1">
                <div className="mt-1 w-4 h-4 rounded bg-purple-500 flex-shrink-0" /> {/* Figmaの紫アイコン風 */}
                <div className="flex flex-col min-w-0">
                  <h3 className="text-[13px] font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                    {p.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {p.date}に編集済み
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};