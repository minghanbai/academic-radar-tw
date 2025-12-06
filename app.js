
const { useState, useEffect, useMemo } = React;

// 圖示組件
const Icons = {
    Radar: () => <i className="ph ph-radar text-2xl"></i>,
    Briefcase: () => <i className="ph ph-briefcase"></i>,
    GraduationCap: () => <i className="ph ph-graduation-cap"></i>,
    Flask: () => <i className="ph ph-flask"></i>,
    Users: () => <i className="ph ph-users"></i>,
    Search: () => <i className="ph ph-magnifying-glass"></i>,
    Link: () => <i className="ph ph-arrow-square-out"></i>,
    Clock: () => <i className="ph ph-clock"></i>,
    Hourglass: () => <i className="ph ph-hourglass-high"></i>,
    Filter: () => <i className="ph ph-faders"></i>
};

function App() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetch('./jobs.json')
            .then(res => res.json())
            .then(data => {
                setJobs(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("讀取失敗:", err);
                setLoading(false);
            });
    }, []);

    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const matchesType = filterType === 'all' || job.type === filterType;
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                job.title.toLowerCase().includes(searchLower) ||
                job.school.toLowerCase().includes(searchLower) ||
                job.dept.toLowerCase().includes(searchLower);
            return matchesType && matchesSearch;
        });
    }, [jobs, filterType, searchTerm]);

    const FilterBtn = ({ type, label, icon: Icon }) => (
        <button
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap
                        ${filterType === type
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
        >
            <Icon /> {label}
        </button>
    );

    const getSourceColor = (source) => {
        switch (source) {
            case 'NSTC': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'MOE': return 'bg-green-100 text-green-700 border-green-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const isUrgent = (deadline) => {
        if (!deadline || deadline === '-') return false;
        const diff = new Date(deadline) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 3;
    };

    return (
        <div className="min-h-screen pb-20">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 text-white p-2 rounded-lg radar-scan">
                            <Icons.Radar />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">TW Academic Radar</h1>
                            <p className="text-xs text-slate-500 font-medium">台灣學術職缺觀測站</p>
                        </div>
                    </div>
                    <div className="hidden md:block text-xs text-slate-400">
                        Powered by GitHub Actions
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8">
                <div className="mb-8 space-y-6">
                    <div className="text-center md:text-left">
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">探索您的學術生涯</h2>
                        <p className="text-slate-500">
                            自動彙整教育部與國科會職缺，每日更新。
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            {/* 修改處：使用 top-1/2 和 -translate-y-1/2 來精準垂直置中 */}
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg flex items-center">
                                <Icons.Search />
                            </div>
                            <input
                                type="text"
                                placeholder="搜尋職稱、學校或系所..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                            <FilterBtn type="all" label="全部" icon={Icons.Briefcase} />
                            <FilterBtn type="faculty" label="專任教職" icon={Icons.GraduationCap} />
                            <FilterBtn type="postdoc" label="博士後" icon={Icons.Flask} />
                            <FilterBtn type="assistant" label="研究助理" icon={Icons.Users} />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-slate-400 animate-pulse">
                        <Icons.Radar className="text-4xl mx-auto mb-4 animate-spin" />
                        <p>正在掃描職缺數據...</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filteredJobs.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                                <p className="text-slate-500">沒有找到符合的職缺</p>
                                <button
                                    onClick={() => { setFilterType('all'); setSearchTerm(''); }}
                                    className="mt-2 text-blue-600 hover:underline text-sm"
                                >
                                    清除篩選條件
                                </button>
                            </div>
                        ) : (
                            filteredJobs.map(job => (
                                <div key={job.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 
                                                ${job.type === 'faculty' ? 'bg-blue-500' :
                                            job.type === 'postdoc' ? 'bg-purple-500' : 'bg-emerald-500'}`}
                                    />

                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pl-2">
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                                <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${getSourceColor(job.source)}`}>
                                                    {job.source}
                                                </span>

                                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Icons.Clock className="text-slate-400" />
                                                    <span className="hidden sm:inline">刊登:</span> {job.date}
                                                </span>

                                                <span className={`text-xs flex items-center gap-1 font-medium
                                                            ${isUrgent(job.deadline) ? 'text-red-600 animate-pulse' : 'text-slate-500'}`}>
                                                    <Icons.Hourglass weight="fill" className={isUrgent(job.deadline) ? 'text-red-600' : 'text-slate-400'} />
                                                    截止: {job.deadline || '-'}
                                                </span>
                                            </div>

                                            <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-blue-700 transition-colors">
                                                {job.title}
                                            </h3>

                                            <div className="text-slate-600 text-sm flex items-center gap-2">
                                                <span className="font-semibold">{job.school}</span>
                                                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                <span>{job.dept}</span>
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {job.tags && job.tags.map(tag => (
                                                    <span key={tag} className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-center">
                                            <a
                                                href={job.link}
                                                target="_blank"
                                                className="px-4 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 w-full md:w-auto justify-center"
                                            >
                                                查看詳情 <Icons.Link />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                <footer className="mt-12 text-center text-slate-400 text-sm border-t border-slate-100 pt-8">
                    <p>© {new Date().getFullYear()} TW Academic Radar. Powered by GitHub Actions & Pages.</p>
                </footer>
            </main>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);