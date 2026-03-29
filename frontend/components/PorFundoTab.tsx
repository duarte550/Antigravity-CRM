import React, { useState, useEffect, useMemo } from 'react';
import { StructuringOperation } from '../types';
import { fetchApi } from '../utils/api';

interface PorFundoTabProps {
    operations: StructuringOperation[];
    apiUrl: string;
    showToast: (msg: string, type: 'success' | 'error') => void;
    onEditOperation: (op: StructuringOperation) => void;
    pushToGenericQueue?: (url: string, method: string, payload: any) => void;
    onCreateOperation?: () => void;
}

const formatCurrency = (val: number) => `R$ ${(val).toFixed(2)}M`;
const formatPercent = (val: number) => `${val.toFixed(2)}%`;

const ALL_TEMPERATURES = ['Quente', 'Morno', 'Frio', 'N/D'];

const getRiscoValor = (riscoData: any[], info: string) => {
    const item = riscoData.find(d => d.Info === info);
    return item ? (item.Valor || 0) : 0;
};

const PorFundoTab: React.FC<PorFundoTabProps> = ({ operations, apiUrl, showToast, onEditOperation, pushToGenericQueue, onCreateOperation }) => {
    const [funds, setFunds] = useState<string[]>([]);
    const [selectedFund, setSelectedFund] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    const [riscoData, setRiscoData] = useState<any[]>([]);
    const [inputs, setInputs] = useState({
        emission: 0,
        prepayment: 0,
        repurchases: 0,
        new_repo: 0,
        simulated_ops_overrides: ""
    });

    // Internal loading state while fetching specific fund
    const [isFetchingFund, setIsFetchingFund] = useState(false);
    
    const [selectedTemperatures, setSelectedTemperatures] = useState<string[]>(ALL_TEMPERATURES);
    const [overrides, setOverrides] = useState<Record<string, any>>({});

    // Cache of fund cash data for auto-selecting the fund with most cash
    const [fundCashMap, setFundCashMap] = useState<Record<string, number>>({});

    // Persist the selected fund to localStorage
    useEffect(() => {
        if (selectedFund) {
            localStorage.setItem('crm_porfundo_last_fund', selectedFund);
        }
    }, [selectedFund]);

    useEffect(() => {
        const loadFunds = async () => {
            try {
                const res = await fetchApi(`${apiUrl}/api/fund-simulator/funds`);
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) return;

                setFunds(data);

                // Check localStorage for the last-used fund
                const cachedFund = localStorage.getItem('crm_porfundo_last_fund');
                if (cachedFund && data.includes(cachedFund)) {
                    setSelectedFund(cachedFund);
                    return;
                }

                // No cached fund — determine the one with the most cash available
                // Fetch cash data for each fund in parallel to find max caixa
                try {
                    const cashResults = await Promise.all(
                        data.map(async (fundName: string) => {
                            try {
                                const fundRes = await fetchApi(`${apiUrl}/api/fund-simulator/data/${encodeURIComponent(fundName)}`);
                                const fundData = await fundRes.json();
                                const caixa = (fundData.riscoData || []).find((d: any) => d.Info === 'Caixa Líquido - Financeiro');
                                return { fund: fundName, cash: caixa ? (caixa.Valor || 0) : 0 };
                            } catch {
                                return { fund: fundName, cash: 0 };
                            }
                        })
                    );

                    // Store the cash map for reference
                    const newCashMap: Record<string, number> = {};
                    cashResults.forEach(r => { newCashMap[r.fund] = r.cash; });
                    setFundCashMap(newCashMap);

                    // Select the fund with the highest cash
                    const bestFund = cashResults.reduce((best, curr) => curr.cash > best.cash ? curr : best, cashResults[0]);
                    setSelectedFund(bestFund.fund);
                } catch {
                    // Fallback: just select the first fund
                    setSelectedFund(data[0]);
                }
            } catch (err) {
                console.error(err);
                showToast("Erro ao carregar fundos", "error");
            }
        };

        loadFunds();
    }, [apiUrl]);

    useEffect(() => {
        if (!selectedFund) return;
        setIsFetchingFund(true);
        fetchApi(`${apiUrl}/api/fund-simulator/data/${encodeURIComponent(selectedFund)}`)
            .then(res => res.json())
            .then(data => {
                setRiscoData(data.riscoData || []);
                const incInputs = data.inputs || { emission: 0, prepayment: 0, repurchases: 0, new_repo: 0, simulated_ops_overrides: "" };
                setInputs(incInputs);
                if (incInputs.simulated_ops_overrides) {
                    try { setOverrides(JSON.parse(incInputs.simulated_ops_overrides)); } catch(e) {}
                } else {
                    setOverrides({});
                }
            })
            .catch(err => {
                console.error(err);
                showToast("Erro ao carregar dados do fundo", "error");
            })
            .finally(() => setIsFetchingFund(false));
    }, [selectedFund, apiUrl]);

    const handleInputChange = (field: string, value: string) => {
        setInputs(prev => ({ ...prev, [field]: Number(value) || 0 }));
    };

    const saveInputs = async () => {
        try {
            const newOverrides: Record<string, any> = { ...overrides };
            simulatedOps.forEach(op => {
                newOverrides[op.id] = {
                    volume: op.volume,
                    rate: op.rate,
                    indexer: op.indexer,
                    isActiveInSimulation: op.isActiveInSimulation !== false
                };
            });
            const payload = { ...inputs, simulated_ops_overrides: JSON.stringify(newOverrides) };

            setOverrides(newOverrides);

            if (pushToGenericQueue) {
                pushToGenericQueue(`${apiUrl}/api/fund-simulator/inputs/${encodeURIComponent(selectedFund)}`, 'POST', payload);
                showToast("Premissas na fila de salvação (sync-queue)", "success");
            } else {
                const res = await fetchApi(`${apiUrl}/api/fund-simulator/inputs/${encodeURIComponent(selectedFund)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast("Valores salvos com sucesso", "success");
                } else {
                    throw new Error("Erro na API");
                }
            }
        } catch (error) {
            console.error(error);
            showToast("Erro ao salvar", "error");
        }
    };

    // Derived Data
    const dataRef = riscoData.length > 0 ? new Date(riscoData[0].Data).toLocaleDateString('pt-BR') : '';

    const plAtual = getRiscoValor(riscoData, 'PL - Financeiro') / 1000000;
    const caixaAtual = getRiscoValor(riscoData, 'Caixa Líquido - Financeiro') / 1000000;
    const lciAtual = getRiscoValor(riscoData, 'LCI - Financeiro') / 1000000;
    const compromissadasAtual = getRiscoValor(riscoData, 'Compromissadas - Financeiro') / 1000000;
    const compromissadasReversas = getRiscoValor(riscoData, 'Repo - Financeiro') / 1000000;

    const totalEntradas = inputs.emission + inputs.prepayment + inputs.repurchases + inputs.new_repo;

    const opSaidasBase = useMemo(() => {
        const matching = operations.filter(o => 
            o.isActive !== false && 
            o.series?.some(s => s.fund === selectedFund) &&
            selectedTemperatures.includes(o.temperature || 'N/D')
        );
        const rows: any[] = [];
        matching.forEach(o => {
            const seriesNoFundo = o.series?.filter(s => s.fund === selectedFund) || [];
            seriesNoFundo.forEach((s) => {
                const uniqueId = s.id ? `${o.id}_${s.id}` : `${o.id}_${s.name.replace(/\s+/g, '')}`;
                const ov = overrides[uniqueId] || {};
                rows.push({
                    id: uniqueId,
                    name: `${o.name} - ${s.name}`,
                    volume: ov.volume !== undefined ? ov.volume : (s.volume || 0),
                    liquidationDate: o.liquidationDate,
                    rate: ov.rate !== undefined ? ov.rate : ((s.rate && !isNaN(Number(s.rate))) ? (Number(s.rate) * 100).toFixed(2).replace('.', ',') : (s.rate || '')),
                    indexer: ov.indexer !== undefined ? ov.indexer : (s.indexer || 'CDI'),
                    isActiveInSimulation: ov.isActiveInSimulation !== undefined ? ov.isActiveInSimulation : true,
                    originalOp: o
                });
            });
        });
        return rows;
    }, [operations, selectedFund, selectedTemperatures, overrides]);

    // Estado local para simulação das saídas
    const [simulatedOps, setSimulatedOps] = useState(opSaidasBase);
    const [isSimulating, setIsSimulating] = useState(false);
    const [isAddingNewOp, setIsAddingNewOp] = useState(false);
    const [selectedOpIdToAdd, setSelectedOpIdToAdd] = useState<number | ''>('');
    const [opSearchTerm, setOpSearchTerm] = useState('');
    const availableOps = useMemo(() => {
        return operations.filter(o => o.isActive !== false);
    }, [operations]);

    useEffect(() => {
        setSimulatedOps(opSaidasBase);
        setIsSimulating(false);
    }, [opSaidasBase]);

    const handleSimulateChange = (id: string | number, field: string, value: string | number | boolean) => {
        setIsSimulating(true);
        setSimulatedOps(prev => prev.map(op => op.id === id ? { ...op, [field]: value } : op));
    };

    const resetSimulation = () => {
        setSimulatedOps(opSaidasBase);
        setIsSimulating(false);
        showToast("Valores originais restaurados", "success");
    };

    const activeOps = simulatedOps.filter(o => o.isActiveInSimulation !== false);
    const sumSaidas = activeOps.reduce((acc, curr) => acc + Math.abs(curr.volume || 0), 0);
    const totalSaidas = -sumSaidas;
    // Conta final solicitada: caixa + lci + entradas + liquidações(como número negativo)
    const caixaApos = caixaAtual + lciAtual + totalEntradas + totalSaidas;
    const caixaMenosComp = caixaApos + compromissadasReversas;

    const plFinal = plAtual + inputs.emission;

    // Taxas
    const getTaxaHoje = (idx: string) => {
        const val = getRiscoValor(riscoData, `Taxa Média Curva ${idx}`);
        return val ? formatPercent(val * 100) : '-';
    };

    const calcPipelineTaxMid = (idx: string) => {
        const ops = activeOps.filter(o => o.indexer.toUpperCase() === idx.toUpperCase());
        if (!ops.length) return null;
        let sumVol = 0;
        let sumProd = 0;
        ops.forEach(o => {
            const rString = String(o.rate || '').replace(',', '.');
            const r = parseFloat(rString.replace(/[^0-9.-]/g, ''));
            if (!isNaN(r) && o.volume) {
                sumVol += o.volume;
                sumProd += (r / 100) * o.volume;
            }
        });
        return sumVol > 0 ? (sumProd / sumVol) * 100 : null;
    };

    const calcFinalTax = (idx: string) => {
        let financialHoje = getRiscoValor(riscoData, `CRI ${idx} - Financeiro`) / 1000000;
        let taxHoje = getRiscoValor(riscoData, `Taxa Média Curva ${idx}`);

        let sumVolPipe = 0;
        let sumProdPipe = 0;
        const ops = activeOps.filter(o => o.indexer.toUpperCase() === idx.toUpperCase());
        ops.forEach(o => {
            const rString = String(o.rate || '').replace(',', '.');
            const r = parseFloat(rString.replace(/[^0-9.-]/g, ''));
            if (!isNaN(r) && o.volume) {
                sumVolPipe += o.volume;
                sumProdPipe += (r / 100) * o.volume; // treat as decimal internally
            }
        });

        const totalVol = financialHoje + sumVolPipe;
        if (totalVol === 0) return null;

        const finalTax = ((financialHoje * taxHoje) + sumProdPipe) / totalVol;
        return finalTax * 100; // back to percentage
    };

    const indexadoresAtivos = ['CDI', 'IPCA', 'IGPM'];

    if (isFetchingFund && !riscoData.length) {
        return <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Carregando dados estruturais do fundo...</div>;
    }

    if (!isFetchingFund && funds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center h-[60vh] mix-blend-luminosity">
                <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-100 dark:border-gray-700">
                    <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">Nenhum Fundo Disponível</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">Não foram encontrados dados de risco importados no sistema para montar o simulador de portfólio. Verifique o banco de dados principal.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full p-2 mt-4 font-sans">
            {/* Cabeçalho de Seleção */}
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-xl text-blue-600 dark:text-blue-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-0.5">Portfólio</span>
                        <div className="relative group mt-1">
                            <select
                                value={selectedFund}
                                onChange={e => setSelectedFund(e.target.value)}
                                className="text-gray-900 dark:text-white bg-gray-50/80 dark:bg-gray-900/50 font-bold text-lg border border-gray-200 dark:border-gray-700/80 rounded-xl pr-10 pl-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none hover:bg-white dark:hover:bg-gray-800 transition-all shadow-sm"
                            >
                                {funds.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {dataRef && (
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-wider">Data-base</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{dataRef}</span>
                        </div>
                    )}
                    <button onClick={saveInputs} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        Salvar Premissas
                    </button>
                </div>
            </div>

            {/* Filtros de Pipeline */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700/80 shadow-sm flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                    Filtrar Pipeline:
                </div>
                {ALL_TEMPERATURES.map(temp => (
                    <label key={temp} className={`flex items-center gap-1.5 cursor-pointer bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg border transition-colors ${selectedTemperatures.includes(temp) ? 'border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white"
                            checked={selectedTemperatures.includes(temp)}
                            onChange={(e) => {
                                if (e.target.checked) setSelectedTemperatures([...selectedTemperatures, temp]);
                                else setSelectedTemperatures(selectedTemperatures.filter(t => t !== temp));
                            }}
                        />
                        <span className={`text-xs font-bold ${
                            temp === 'Quente' ? 'text-orange-600 dark:text-orange-400' :
                            temp === 'Morno' ? 'text-amber-500 dark:text-amber-400' :
                            temp === 'Frio' ? 'text-blue-500 dark:text-blue-400' :
                            'text-gray-500 dark:text-gray-400'
                        }`}>{temp}</span>
                    </label>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Lado Esquerdo - Fluxo (Maior parte) */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm overflow-hidden text-sm">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-transparent">
                            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Projeção de Caixa
                            </h2>
                        </div>
                        <table className="w-full text-left border-collapse">
                            <tbody className="text-gray-800 dark:text-gray-200">
                                {/* Posição Inicial */}
                                <tr className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="p-4 font-medium text-gray-600 dark:text-gray-400 w-1/2">Caixa Disponível Hoje</td>
                                    <td className="p-4 font-mono font-medium text-right">{formatCurrency(caixaAtual)}</td>
                                    <td className="p-4 text-right text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((caixaAtual / plAtual) * 100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="p-4 font-medium text-blue-600 dark:text-blue-400">Posição em LCI</td>
                                    <td className="p-4 font-mono font-medium text-right">{formatCurrency(lciAtual)}</td>
                                    <td className="p-4 text-right text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((lciAtual / plAtual) * 100) : '-'}</td>
                                </tr>

                                {/* Entradas */}
                                <tr className="border-b border-gray-100 dark:border-gray-700/80 bg-emerald-50/30 dark:bg-emerald-900/10">
                                    <td className="p-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                        (+) Previsão de Entradas (R$ MM)
                                    </td>
                                    <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400 text-right">{formatCurrency(totalEntradas)}</td>
                                    <td className="p-4 text-right font-medium text-emerald-600/70 dark:text-emerald-400/70">{plAtual ? formatPercent((totalEntradas / plAtual) * 100) : '-'}</td>
                                </tr>

                                <tr className="border-b border-gray-50 dark:border-gray-700/30 group">
                                    <td className="p-3 pl-8 text-gray-500 dark:text-gray-400 font-medium">Nova Emissão Acordada</td>
                                    <td className="p-2 py-3">
                                        <div className="flex items-center justify-end w-40 ml-auto bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600/80 rounded-md shadow-inner focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all hover:bg-white focus-within:bg-white overflow-hidden group/input">
                                            <div className="px-2.5 py-1.5 flex items-center justify-center border-r border-gray-200 dark:border-gray-600/50 bg-gray-100/60 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs font-bold pointer-events-none group-focus-within/input:text-blue-500">R$ MM</div>
                                            <input type="number" value={inputs.emission} onChange={e => handleInputChange('emission', e.target.value)} className="w-full py-1.5 px-2 bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono outline-none border-none shadow-none focus:ring-0" placeholder="0" />
                                        </div>
                                    </td>
                                    <td className="p-3 text-right text-sm text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((inputs.emission / plAtual) * 100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-50 dark:border-gray-700/30 group">
                                    <td className="p-3 pl-8 text-gray-500 dark:text-gray-400 font-medium">Pré-pagamentos Previstos</td>
                                    <td className="p-2 py-3">
                                        <div className="flex items-center justify-end w-40 ml-auto bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600/80 rounded-md shadow-inner focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all hover:bg-white focus-within:bg-white overflow-hidden group/input">
                                            <div className="px-2.5 py-1.5 flex items-center justify-center border-r border-gray-200 dark:border-gray-600/50 bg-gray-100/60 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs font-bold pointer-events-none group-focus-within/input:text-blue-500">R$ MM</div>
                                            <input type="number" value={inputs.prepayment} onChange={e => handleInputChange('prepayment', e.target.value)} className="w-full py-1.5 px-2 bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono outline-none border-none shadow-none focus:ring-0" placeholder="0" />
                                        </div>
                                    </td>
                                    <td className="p-3 text-right text-sm text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((inputs.prepayment / plAtual) * 100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-50 dark:border-gray-700/30 group">
                                    <td className="p-3 pl-8 text-gray-500 dark:text-gray-400 font-medium">Recompras (G. Econômico)</td>
                                    <td className="p-2 py-3">
                                        <div className="flex items-center justify-end w-40 ml-auto bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600/80 rounded-md shadow-inner focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all hover:bg-white focus-within:bg-white overflow-hidden group/input">
                                            <div className="px-2.5 py-1.5 flex items-center justify-center border-r border-gray-200 dark:border-gray-600/50 bg-gray-100/60 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs font-bold pointer-events-none group-focus-within/input:text-blue-500">R$ MM</div>
                                            <input type="number" value={inputs.repurchases} onChange={e => handleInputChange('repurchases', e.target.value)} className="w-full py-1.5 px-2 bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono outline-none border-none shadow-none focus:ring-0" placeholder="0" />
                                        </div>
                                    </td>
                                    <td className="p-3 text-right text-sm text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((inputs.repurchases / plAtual) * 100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700/80 group">
                                    <td className="p-3 pl-8 text-gray-500 dark:text-gray-400 font-medium">Captação em Compromissadas</td>
                                    <td className="p-2 py-3">
                                        <div className="flex items-center justify-end w-40 ml-auto bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600/80 rounded-md shadow-inner focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all hover:bg-white focus-within:bg-white overflow-hidden group/input">
                                            <div className="px-2.5 py-1.5 flex items-center justify-center border-r border-gray-200 dark:border-gray-600/50 bg-gray-100/60 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-xs font-bold pointer-events-none group-focus-within/input:text-blue-500">R$ MM</div>
                                            <input type="number" value={inputs.new_repo} onChange={e => handleInputChange('new_repo', e.target.value)} className="w-full py-1.5 px-2 bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono outline-none border-none shadow-none focus:ring-0" placeholder="0" />
                                        </div>
                                    </td>
                                    <td className="p-3 text-right text-sm text-gray-400 dark:text-gray-500">{plAtual ? formatPercent((inputs.new_repo / plAtual) * 100) : '-'}</td>
                                </tr>

                                {/* Saídas */}
                                <tr className="border-b border-gray-100 dark:border-gray-700/80 bg-rose-50/30 dark:bg-rose-900/10">
                                    <td className="p-4 font-bold text-gray-900 dark:text-white flex justify-between items-center group/header relative">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                            (-) Liquidações (R$ MM)
                                        </div>
                                        {isSimulating && (
                                            <button onClick={resetSimulation} className="absolute right-4 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 px-2.5 py-1 rounded-md transition-all font-medium opacity-0 group-hover/header:opacity-100">
                                                Restaurar Valores Originais
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-4 font-bold text-rose-600 dark:text-rose-400 text-right">{formatCurrency(totalSaidas)}</td>
                                    <td className="p-4 text-right font-medium text-rose-600/70 dark:text-rose-400/70">{plAtual ? formatPercent((totalSaidas / plAtual) * 100) : '-'}</td>
                                </tr>

                                {simulatedOps.length === 0 && (
                                    <tr><td colSpan={3} className="p-6 text-center text-sm text-gray-400 italic">O pipeline não possui liquidações ativas para este fundo no momento.</td></tr>
                                )}
                                {simulatedOps.map((o) => (
                                    <tr key={o.id} className={`border-b border-gray-50 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${o.isActiveInSimulation === false ? 'opacity-40 grayscale' : ''}`}>
                                        <td className="p-3 pl-8 text-xs relative">
                                            <div className="absolute left-2 top-4">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                                                    title="Incluir/Excluir operação da projeção final"
                                                    checked={o.isActiveInSimulation !== false} 
                                                    onChange={(e) => handleSimulateChange(o.id, 'isActiveInSimulation', e.target.checked)} 
                                                />
                                            </div>
                                            <div className="flex justify-between items-start mb-1.5 ml-2">
                                                <span className={`font-semibold ${o.isActiveInSimulation === false ? 'line-through text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>{o.name}</span>
                                                <button onClick={() => onEditOperation(o.originalOp)} className="text-gray-300 hover:text-blue-500 transition-colors"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold">Tx:</span>
                                                    <input
                                                        type="text"
                                                        value={o.rate}
                                                        onChange={(e) => handleSimulateChange(o.id, 'rate', e.target.value)}
                                                        className="w-14 p-1 text-xs border border-gray-200 dark:border-gray-600/80 rounded bg-gray-50 dark:bg-gray-900/50 focus:bg-white dark:focus:bg-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100 transition-all font-mono shadow-sm hover:bg-white"
                                                    />
                                                </div>
                                                <div className="flex items-center">
                                                    <select
                                                        value={o.indexer}
                                                        onChange={(e) => handleSimulateChange(o.id, 'indexer', e.target.value)}
                                                        className="w-full text-xs p-1 border border-gray-200 dark:border-gray-600/80 rounded bg-gray-50 dark:bg-gray-900/50 focus:bg-white dark:focus:bg-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-300 transition-all font-medium py-1 shadow-sm hover:bg-white"
                                                    >
                                                        <option value="CDI">CDI</option><option value="IPCA">IPCA</option><option value="IGPM">IGPM</option><option value="Pré">Pré</option>
                                                    </select>
                                                </div>
                                                <div className="flex-1 text-[10px] text-gray-400 text-right mt-1.5 truncate">
                                                    {o.liquidationDate ? new Date(o.liquidationDate).toLocaleDateString('pt-BR') : 'Sem data def.'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 align-top pt-4">
                                            <div className="flex items-center justify-end w-32 ml-auto bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600/80 rounded-md shadow-inner focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all hover:bg-white focus-within:bg-white overflow-hidden group/vol">
                                                <div className="px-1.5 py-1.5 flex items-center justify-center border-r border-gray-200 dark:border-gray-600/50 bg-gray-100/60 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500 text-[10px] font-bold pointer-events-none group-focus-within/vol:text-blue-500">R$ MM</div>
                                                <input type="number" value={o.volume} onChange={(e) => handleSimulateChange(o.id, 'volume', Number(e.target.value))} className="w-full py-1 px-1 bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono text-sm outline-none border-none shadow-none focus:ring-0" placeholder="0" />
                                            </div>
                                        </td>
                                        <td className="p-3 text-right text-gray-400 dark:text-gray-500 text-sm align-top pt-5">{plAtual ? formatPercent((o.volume / plAtual) * 100) : '-'}</td>
                                    </tr>
                                ))}

                                {/* Adicionar Operação */}
                                <tr className="border-b border-gray-50 dark:border-gray-700/30">
                                    <td colSpan={3} className="p-3 bg-gray-50/20 dark:bg-gray-800/10">
                                        {!isAddingNewOp ? (
                                            <button onClick={() => setIsAddingNewOp(true)} className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-500 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-600 transition-colors bg-white/50 dark:bg-gray-800/50">
                                                + Adicionar operação ao Liquidador
                                            </button>
                                        ) : (
                                            <div className="p-4 border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-900/10 rounded-xl space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        Incluir Operação no Mix de Liquidação
                                                    </span>
                                                    <button onClick={() => { setIsAddingNewOp(false); setSelectedOpIdToAdd(''); setOpSearchTerm(''); }} className="text-gray-400 hover:text-red-500 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                                </div>
                                                
                                                <div className="relative flex-1">
                                                    <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                    <input 
                                                        type="text" 
                                                        autoFocus
                                                        placeholder="Buscar operação ativa..."
                                                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                                                        value={opSearchTerm}
                                                        onChange={(e) => setOpSearchTerm(e.target.value)}
                                                    />
                                                </div>

                                                <div className="flex gap-2 items-stretch">
                                                    <select 
                                                        className="flex-1 text-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1"
                                                        value={selectedOpIdToAdd}
                                                        onChange={e => setSelectedOpIdToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                                                        size={4}
                                                    >
                                                        {availableOps.filter(op => op.name.toLowerCase().includes(opSearchTerm.toLowerCase())).map(op => <option key={op.id} value={op.id} className="cursor-pointer py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded">{op.name}</option>)}
                                                        {availableOps.filter(op => op.name.toLowerCase().includes(opSearchTerm.toLowerCase())).length === 0 && <option disabled className="text-gray-400 italic py-1 px-2">Nenhuma operação encontrada...</option>}
                                                    </select>
                                                    <button 
                                                        disabled={!selectedOpIdToAdd}
                                                        onClick={() => {
                                                            if (!selectedOpIdToAdd) return;
                                                            const op = operations.find(o => o.id === selectedOpIdToAdd);
                                                            if (!op) return;
                                                            const updatedOp = { ...op, series: [...(op.series || []), { name: `Nova Série - ${selectedFund}`, rate: '', indexer: 'CDI', volume: 0, fund: selectedFund }] };
                                                            onEditOperation(updatedOp);
                                                            setIsAddingNewOp(false);
                                                            setSelectedOpIdToAdd('');
                                                            setOpSearchTerm('');
                                                        }}
                                                        className="px-4 py-2 w-32 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm self-stretch flex items-center justify-center"
                                                    >
                                                        Vincular
                                                    </button>
                                                </div>
                                                {onCreateOperation && (
                                                    <div className="pt-3 border-t border-blue-100 dark:border-blue-800/30 text-center flex items-center justify-center gap-1.5">
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">A operação que você procura não existe? </span>
                                                        <button onClick={onCreateOperation} className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">
                                                            Criar Nova Operação em Estruturação
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Nova Linha de Destaque: Caixa após Saídas */}
                                <tr className="bg-blue-50/50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800/40">
                                    <td className="p-4 font-semibold text-blue-900 dark:text-blue-100 text-sm tracking-wide">CAIXA FINAL PROJETADO</td>
                                    <td className="p-4 font-bold font-mono text-base text-blue-700 dark:text-blue-400 text-right">{formatCurrency(caixaApos)}</td>
                                    <td className="p-4 font-bold text-right text-blue-600/70 dark:text-blue-400/70">{plAtual ? formatPercent((caixaApos / plAtual) * 100) : '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-800 dark:to-gray-800/80 rounded-2xl p-5 border border-indigo-100 dark:border-gray-700 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Posição de Liquidez Final
                            </h3>
                        </div>
                        <div className="space-y-3 font-mono text-sm w-full font-medium">
                            <div className="flex justify-between text-gray-600 dark:text-gray-400 items-center">
                                <span>Caixa Pós Movimentações:</span>
                                <span className="font-medium text-gray-900 dark:text-gray-100 text-base">{formatCurrency(caixaApos)}</span>
                            </div>
                            <div className="flex justify-between text-gray-500 dark:text-gray-500 items-center">
                                <span>(-) Compromissadas Reversas:</span>
                                <span>({formatCurrency(compromissadasReversas)})</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg pt-4 pb-2 border-t border-indigo-200/50 dark:border-gray-700 text-indigo-900 dark:text-indigo-200 items-center">
                                <span>Caixa Líquido Livre:</span>
                                <span>{formatCurrency(caixaMenosComp)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lado Direito - Impactos */}
                <div className="lg:col-span-5 space-y-6">
                    {/* PL */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            Impacto no PL
                        </h3>
                        <table className="w-full text-sm">
                            <tbody className="text-gray-600 dark:text-gray-400">
                                <tr>
                                    <td className="py-2">Visão Inicial</td>
                                    <td className="py-2 text-right font-mono font-medium text-gray-900 dark:text-gray-200">{formatCurrency(plAtual)}</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-emerald-600 dark:text-emerald-400">(+) Emissão</td>
                                    <td className="py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(inputs.emission)}</td>
                                </tr>
                                <tr className="border-t border-gray-100 dark:border-gray-700">
                                    <td className="py-3 font-bold text-gray-900 dark:text-white">PL Base Projetado</td>
                                    <td className="py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(plFinal)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Taxas */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm overflow-x-auto">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            Mix de Taxas Projetadas
                        </h3>
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                <tr>
                                    <th className="pb-3 font-medium">Index.</th>
                                    <th className="pb-3 font-medium text-right">Carteira Atual</th>
                                    <th className="pb-3 font-medium text-right text-indigo-600 dark:text-indigo-400">Pipeline</th>
                                    <th className="pb-3 font-medium text-right text-gray-900 dark:text-gray-200">Combinada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                                {indexadoresAtivos.map(idx => {
                                    const txHoje = getTaxaHoje(idx);
                                    const txPipe = calcPipelineTaxMid(idx);
                                    const txFinal = calcFinalTax(idx);

                                    if (txHoje === '-' && txPipe === null) return null;

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="py-3 font-medium text-gray-900 dark:text-gray-200">{idx} +</td>
                                            <td className="py-3 text-right font-mono text-gray-500">{txHoje}</td>
                                            <td className="py-3 text-right font-mono text-indigo-600 dark:text-indigo-400 font-medium">{txPipe !== null ? formatPercent(txPipe) : '-'}</td>
                                            <td className="py-3 text-right font-mono font-bold text-gray-900 dark:text-white bg-gray-50/50 dark:bg-transparent px-2 rounded-r-lg">{txFinal !== null ? formatPercent(txFinal) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Compromissadas */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                            Volume de Compromissadas
                        </h3>
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                <tr>
                                    <th className="pb-3 font-medium">Conta</th>
                                    <th className="pb-3 font-medium text-right">R$ Valor</th>
                                    <th className="pb-3 font-medium text-right">% PL Ant.</th>
                                    <th className="pb-3 font-medium text-right text-purple-600 dark:text-purple-400">% PL Proj.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-gray-600 dark:text-gray-400">
                                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="py-3">Estoque</td>
                                    <td className="py-3 text-right font-mono">{formatCurrency(compromissadasAtual)}</td>
                                    <td className="py-3 text-right">{plAtual ? formatPercent((compromissadasAtual / plAtual) * 100) : '-'}</td>
                                    <td className="py-3 text-right ">{plFinal ? formatPercent((compromissadasAtual / plFinal) * 100) : '-'}</td>
                                </tr>
                                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="py-3 text-purple-600 dark:text-purple-400 font-medium">(+) Captação</td>
                                    <td className="py-3 text-right font-mono font-medium text-purple-600 dark:text-purple-400">{formatCurrency(inputs.new_repo)}</td>
                                    <td className="py-3 text-right">{plAtual ? formatPercent((inputs.new_repo / plAtual) * 100) : '-'}</td>
                                    <td className="py-3 text-right font-medium text-purple-600 dark:text-purple-400">{plFinal ? formatPercent((inputs.new_repo / plFinal) * 100) : '-'}</td>
                                </tr>
                                <tr className="font-bold text-gray-900 dark:text-gray-100 bg-gray-50/50 dark:bg-transparent">
                                    <td className="py-3 px-2 rounded-l-lg">Patamar Final</td>
                                    <td className="py-3 text-right font-mono">{formatCurrency(compromissadasAtual + inputs.new_repo)}</td>
                                    <td className="py-3 text-right text-gray-500 dark:text-gray-500 font-medium">{plAtual ? formatPercent(((compromissadasAtual + inputs.new_repo) / plAtual) * 100) : '-'}</td>
                                    <td className="py-3 text-right text-purple-700 dark:text-purple-400 px-2 rounded-r-lg">{plFinal ? formatPercent(((compromissadasAtual + inputs.new_repo) / plFinal) * 100) : '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PorFundoTab;
