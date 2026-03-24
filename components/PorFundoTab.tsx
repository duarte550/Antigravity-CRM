import React, { useState, useEffect, useMemo } from 'react';
import { StructuringOperation } from '../types';

interface PorFundoTabProps {
    operations: StructuringOperation[];
    apiUrl: string;
    showToast: (msg: string, type: 'success' | 'error') => void;
    onEditOperation: (op: StructuringOperation) => void;
}

const formatCurrency = (val: number) => `R$ ${(val / 1000000).toFixed(2)}M`;
const formatPercent = (val: number) => `${val.toFixed(2)}%`;

const getRiscoValor = (riscoData: any[], info: string) => {
    const item = riscoData.find(d => d.Info === info);
    return item ? (item.Valor || 0) : 0;
};

const PorFundoTab: React.FC<PorFundoTabProps> = ({ operations, apiUrl, showToast, onEditOperation }) => {
    const [funds, setFunds] = useState<string[]>([]);
    const [selectedFund, setSelectedFund] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const [riscoData, setRiscoData] = useState<any[]>([]);
    const [inputs, setInputs] = useState({
        emission: 0,
        prepayment: 0,
        repurchases: 0,
        new_repo: 0
    });
    
    // Internal loading state while fetching specific fund
    const [isFetchingFund, setIsFetchingFund] = useState(false);

    useEffect(() => {
        fetch(`${apiUrl}/api/fund-simulator/funds`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setFunds(data);
                    if (data.length > 0) setSelectedFund(data[0]);
                }
            })
            .catch(err => {
                console.error(err);
                showToast("Erro ao carregar fundos", "error");
            });
    }, [apiUrl]);

    useEffect(() => {
        if (!selectedFund) return;
        setIsFetchingFund(true);
        fetch(`${apiUrl}/api/fund-simulator/data/${encodeURIComponent(selectedFund)}`)
            .then(res => res.json())
            .then(data => {
                setRiscoData(data.riscoData || []);
                setInputs(data.inputs || { emission: 0, prepayment: 0, repurchases: 0, new_repo: 0 });
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
            const res = await fetch(`${apiUrl}/api/fund-simulator/inputs/${encodeURIComponent(selectedFund)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inputs)
            });
            if (res.ok) {
                showToast("Valores salvos com sucesso", "success");
            } else {
                throw new Error("Erro na API");
            }
        } catch (error) {
            console.error(error);
            showToast("Erro ao salvar", "error");
        }
    };

    // Derived Data
    const dataRef = riscoData.length > 0 ? new Date(riscoData[0].Data).toLocaleDateString('pt-BR') : '';

    const plAtual = getRiscoValor(riscoData, 'PL - Financeiro');
    const caixaAtual = getRiscoValor(riscoData, 'Caixa Líquido - Financeiro');
    const lciAtual = getRiscoValor(riscoData, 'LCI - Financeiro');
    const compromissadasAtual = getRiscoValor(riscoData, 'Compromissadas - Financeiro');

    const totalEntradas = inputs.emission + inputs.prepayment + inputs.repurchases + inputs.new_repo;

    const opSaidasBase = useMemo(() => {
        const matching = operations.filter(o => o.isActive !== false && o.series?.some(s => s.fund === selectedFund));
        return matching.map(o => {
            const mySeries = o.series?.find(s => s.fund === selectedFund);
            return {
                id: o.id,
                name: o.name,
                volume: mySeries?.volume || 0,
                liquidationDate: o.liquidationDate,
                rate: mySeries?.rate || '',
                indexer: mySeries?.indexer || 'CDI',
                originalOp: o
            };
        });
    }, [operations, selectedFund]);

    // Estado local para simulação das saídas
    const [simulatedOps, setSimulatedOps] = useState(opSaidasBase);
    const [isSimulating, setIsSimulating] = useState(false);

    useEffect(() => {
        setSimulatedOps(opSaidasBase);
        setIsSimulating(false);
    }, [opSaidasBase]);

    const handleSimulateChange = (id: number, field: string, value: string | number) => {
        setIsSimulating(true);
        setSimulatedOps(prev => prev.map(op => op.id === id ? { ...op, [field]: value } : op));
    };

    const resetSimulation = () => {
        setSimulatedOps(opSaidasBase);
        setIsSimulating(false);
        showToast("Valores originais restaurados", "success");
    };

    const totalSaidas = simulatedOps.reduce((acc, curr) => acc + curr.volume, 0);
    const caixaApos = caixaAtual + totalEntradas - totalSaidas;
    const caixaMenosComp = caixaApos - compromissadasAtual;

    const plFinal = plAtual + inputs.emission;

    // Taxas
    const getTaxaHoje = (idx: string) => {
        const val = getRiscoValor(riscoData, `Taxa Média Curva ${idx}`);
        return val ? formatPercent(val) : '-';
    };

    const calcPipelineTaxMid = (idx: string) => {
        const ops = simulatedOps.filter(o => o.indexer.toUpperCase() === idx.toUpperCase());
        if (!ops.length) return null;
        let sumVol = 0;
        let sumProd = 0;
        ops.forEach(o => {
            const r = parseFloat((o.rate || '').replace(/[^0-9.-]/g, ''));
            if (!isNaN(r) && o.volume) {
                sumVol += o.volume;
                sumProd += r * o.volume;
            }
        });
        return sumVol > 0 ? (sumProd / sumVol) : null;
    };

    const calcFinalTax = (idx: string) => {
        let financialHoje = getRiscoValor(riscoData, `CRI ${idx} - Financeiro`);
        let taxHoje = getRiscoValor(riscoData, `Taxa Média Curva ${idx}`);
        
        let sumVolPipe = 0;
        let sumProdPipe = 0;
        const ops = simulatedOps.filter(o => o.indexer.toUpperCase() === idx.toUpperCase());
        ops.forEach(o => {
            const r = parseFloat((o.rate || '').replace(/[^0-9.-]/g, ''));
            if (!isNaN(r) && o.volume) {
                sumVolPipe += o.volume;
                sumProdPipe += (r/100) * o.volume; // treat as decimal internally
            }
        });

        const totalVol = financialHoje + sumVolPipe;
        if (totalVol === 0) return null;
        
        const finalTax = ((financialHoje * (taxHoje/100)) + sumProdPipe) / totalVol;
        return finalTax * 100; // back to percentage
    };

    const indexadoresAtivos = ['CDI', 'IPCA', 'IGPM'];

    if (isFetchingFund && !riscoData.length) {
        return <div className="p-8 text-center text-gray-500">Carregando dados do fundo...</div>;
    }

    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full p-2 mt-4">
            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Selecionar Fundo:</span>
                    <select 
                        value={selectedFund} 
                        onChange={e => setSelectedFund(e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500"
                    >
                        {funds.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                {dataRef && (
                    <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded text-sm text-gray-600 dark:text-gray-300 font-medium">
                        Data-Base: {dataRef}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Lado Esquerdo - Fluxo */}
                <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden text-sm">
                        <table className="w-full text-left">
                            <tbody className="text-gray-800 dark:text-gray-200">
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="p-3 bg-gray-50 dark:bg-gray-900/50 font-semibold w-1/2 text-gray-900 dark:text-gray-100">Caixa atual:</td>
                                    <td className="p-3 font-mono">{formatCurrency(caixaAtual)}</td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((caixaAtual/plAtual)*100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <td className="p-3 bg-gray-50 dark:bg-gray-900/50 font-semibold text-blue-600 dark:text-blue-400">LCI:</td>
                                    <td className="p-3 font-mono">{formatCurrency(lciAtual)}</td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((lciAtual/plAtual)*100) : '-'}</td>
                                </tr>
                                
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                                    <td className="p-3 font-bold">(+) Entradas</td>
                                    <td className="p-3 font-bold">{formatCurrency(totalEntradas)}</td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((totalEntradas/plAtual)*100) : '-'}</td>
                                </tr>
                                
                                <tr className="border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-gray-800 dark:text-gray-200">
                                    <td className="p-3 pl-6">Emissão</td>
                                    <td className="p-2"><input type="number" value={inputs.emission} onChange={e => handleInputChange('emission', e.target.value)} className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right" /></td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((inputs.emission/plAtual)*100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-gray-800 dark:text-gray-200">
                                    <td className="p-3 pl-6">Pré-pagamento</td>
                                    <td className="p-2"><input type="number" value={inputs.prepayment} onChange={e => handleInputChange('prepayment', e.target.value)} className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right" /></td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((inputs.prepayment/plAtual)*100) : '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-gray-800 dark:text-gray-200">
                                    <td className="p-3 pl-6">Recompras</td>
                                    <td className="p-2"><input type="number" value={inputs.repurchases} onChange={e => handleInputChange('repurchases', e.target.value)} className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right" /></td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((inputs.repurchases/plAtual)*100) : '-'}</td>
                                </tr>
                                <tr className="border-b-2 border-gray-300 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/20 text-gray-800 dark:text-gray-200">
                                    <td className="p-3 pl-6">Compromissadas</td>
                                    <td className="p-2"><input type="number" value={inputs.new_repo} onChange={e => handleInputChange('new_repo', e.target.value)} className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right" /></td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((inputs.new_repo/plAtual)*100) : '-'}</td>
                                </tr>

                                <tr className="border-b-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                                    <td className="p-3 font-bold flex justify-between items-center">
                                        <div className="flex gap-2 items-center">
                                            (-) Saídas
                                            {isSimulating && (
                                                <button onClick={resetSimulation} className="text-[10px] ml-2 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 px-2 py-0.5 rounded transition-colors font-medium">Voltar ao Original</button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 font-bold">{formatCurrency(totalSaidas)}</td>
                                    <td className="p-3 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((totalSaidas/plAtual)*100) : '-'}</td>
                                </tr>

                                {simulatedOps.length === 0 && (
                                    <tr><td colSpan={3} className="p-4 text-center text-gray-400 bg-green-50 dark:bg-green-900/10">Nenhuma saída mapeada.</td></tr>
                                )}
                                {simulatedOps.map((o) => (
                                    <tr key={o.id} className="border-b border-gray-100 dark:border-gray-700 bg-green-50 dark:bg-green-900/10 hover:bg-green-100/50 dark:hover:bg-green-900/20 transition-colors">
                                        <td className="p-3 pl-6 text-xs font-medium">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-gray-900 dark:text-gray-100">{o.name}</span>
                                                <button onClick={() => onEditOperation(o.originalOp)} title="Editar no CRM (Oficial)" className="text-gray-400 hover:text-blue-500">✏️</button>
                                            </div>
                                            <div className="flex gap-2 mt-1">
                                                <div className="flex-1">
                                                    <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-1">Tx:</span>
                                                    <input 
                                                        type="text" 
                                                        value={o.rate} 
                                                        onChange={(e) => handleSimulateChange(o.id, 'rate', e.target.value)}
                                                        className="w-16 p-0.5 text-xs border border-green-200 dark:border-green-800 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                        placeholder="Ex: 2.50%"
                                                    />
                                                </div>
                                                <div className="flex-[0.5]">
                                                    <select 
                                                        value={o.indexer} 
                                                        onChange={(e) => handleSimulateChange(o.id, 'indexer', e.target.value)}
                                                        className="w-full text-xs p-0.5 border border-green-200 dark:border-green-800 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="CDI">CDI</option>
                                                        <option value="IPCA">IPCA</option>
                                                        <option value="IGPM">IGPM</option>
                                                        <option value="Pré">Pré</option>
                                                    </select>
                                                </div>
                                                <div className="flex-[1.5] text-[10px] text-gray-500 dark:text-gray-400 text-right mt-1 truncate">
                                                    Liq: {o.liquidationDate ? new Date(o.liquidationDate).toLocaleDateString('pt-BR') : '-'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 align-top pt-4">
                                            <input 
                                                type="number" 
                                                value={o.volume} 
                                                onChange={(e) => handleSimulateChange(o.id, 'volume', Number(e.target.value))}
                                                className="w-24 p-1 text-xs border border-green-300 dark:border-green-700/60 rounded bg-white dark:bg-gray-800 font-mono text-right text-gray-900 dark:text-gray-100"
                                            />
                                        </td>
                                        <td className="p-3 text-right text-gray-500 dark:text-gray-400 xl:text-xs text-[10px] align-top pt-5">{plAtual ? formatPercent((o.volume/plAtual)*100) : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={saveInputs} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold text-sm transition-colors shadow-sm">
                            Salvar Entradas
                        </button>
                    </div>

                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 font-mono font-semibold text-sm border border-gray-200 dark:border-gray-700 shadow-sm space-y-2 text-gray-800 dark:text-gray-200">
                        <div className="flex justify-between">
                            <span className="text-gray-700 dark:text-gray-300">Caixa após Entradas e Saída:</span>
                            <span className="text-gray-900 dark:text-gray-100">{formatCurrency(caixaApos)} ({formatPercent((caixaApos/plAtual)*100)})</span>
                        </div>
                        <div className="flex justify-between text-gray-500 dark:text-gray-400">
                            <span>(-) Compromissadas Atual:</span>
                            <span>({formatCurrency(compromissadasAtual)})</span>
                        </div>
                        <div className="flex justify-between text-lg text-gray-900 dark:text-white pt-2 border-t border-gray-300 dark:border-gray-600">
                            <span>Caixa (-) Compromissadas:</span>
                            <span>{formatCurrency(caixaMenosComp)}</span>
                        </div>
                    </div>
                </div>

                {/* Lado Direito - Impactos */}
                <div className="space-y-6">
                    {/* PL */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-sm">
                        <table className="w-full text-left">
                            <tbody className="text-gray-800 dark:text-gray-200">
                                <tr>
                                    <td className="p-2 text-gray-600 dark:text-gray-400">PL Atual</td>
                                    <td className="p-2 text-right font-mono">{formatCurrency(plAtual)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 text-gray-600 dark:text-gray-400">Nova Emissão</td>
                                    <td className="p-2 text-right font-mono">{formatCurrency(inputs.emission)}</td>
                                </tr>
                                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold bg-gray-50 dark:bg-gray-900/50">
                                    <td className="p-2 text-gray-900 dark:text-gray-100">PL Final (**)</td>
                                    <td className="p-2 text-right font-mono text-gray-900 dark:text-gray-100">{formatCurrency(plFinal)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Taxas */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto text-sm">
                        <table className="w-full text-left">
                            <thead className="border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                                <tr>
                                    <th className="p-2 font-medium">Portfolio</th>
                                    <th className="p-2 font-medium text-right">Hoje</th>
                                    <th className="p-2 font-medium text-right">Pipeline</th>
                                    <th className="p-2 font-medium text-right bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">Final</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-gray-800 dark:text-gray-200">
                                {indexadoresAtivos.map(idx => {
                                    const txHoje = getTaxaHoje(idx);
                                    const txPipe = calcPipelineTaxMid(idx);
                                    const txFinal = calcFinalTax(idx);
                                    
                                    // Pular linha se o indexador não existir na carteira nem no pipeline
                                    if (txHoje === '-' && txPipe === null) return null;

                                    return (
                                        <tr key={idx}>
                                            <td className="p-2 font-medium">{idx} +</td>
                                            <td className="p-2 text-right font-mono">{txHoje}</td>
                                            <td className="p-2 text-right font-mono text-blue-600 dark:text-blue-400">{txPipe !== null ? formatPercent(txPipe) : '-'}</td>
                                            <td className="p-2 text-right font-mono font-bold bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-white">{txFinal !== null ? formatPercent(txFinal) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Compromissadas */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-sm">
                        <table className="w-full text-left">
                            <thead className="border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                                <tr>
                                    <th className="p-2 font-medium">Compromissadas</th>
                                    <th className="p-2 font-medium text-right">Valor</th>
                                    <th className="p-2 font-medium text-right">% PL</th>
                                    <th className="p-2 font-medium text-right text-blue-600">% PL**</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-gray-800 dark:text-gray-200">
                                <tr>
                                    <td className="p-2">Atual</td>
                                    <td className="p-2 text-right font-mono">{formatCurrency(compromissadasAtual)}</td>
                                    <td className="p-2 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((compromissadasAtual/plAtual)*100) : '-'}</td>
                                    <td className="p-2 text-right text-blue-500 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10">{plFinal ? formatPercent((compromissadasAtual/plFinal)*100) : '-'}</td>
                                </tr>
                                <tr>
                                    <td className="p-2">(+) Novas</td>
                                    <td className="p-2 text-right font-mono font-medium">{formatCurrency(inputs.new_repo)}</td>
                                    <td className="p-2 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent((inputs.new_repo/plAtual)*100) : '-'}</td>
                                    <td className="p-2 text-right text-blue-500 dark:text-blue-400 font-medium bg-blue-50/50 dark:bg-blue-900/10">{plFinal ? formatPercent((inputs.new_repo/plFinal)*100) : '-'}</td>
                                </tr>
                                <tr className="font-bold bg-gray-50 dark:bg-gray-900/50">
                                    <td className="p-2 text-gray-900 dark:text-gray-100">Total</td>
                                    <td className="p-2 text-right font-mono text-gray-900 dark:text-gray-100">{formatCurrency(compromissadasAtual + inputs.new_repo)}</td>
                                    <td className="p-2 text-right text-gray-500 dark:text-gray-400">{plAtual ? formatPercent(((compromissadasAtual+inputs.new_repo)/plAtual)*100) : '-'}</td>
                                    <td className="p-2 text-right text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30">{plFinal ? formatPercent(((compromissadasAtual+inputs.new_repo)/plFinal)*100) : '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-right">** PL considerando nova emissão</p>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PorFundoTab;
