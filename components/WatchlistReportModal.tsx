import React, { useMemo, useRef } from 'react';
import type { Operation, RatingHistoryEntry } from '../types';
import { WatchlistStatus } from '../types';
import Modal from './Modal';
import WatchlistHistoryChart from './WatchlistHistoryChart';

interface WatchlistReportModalProps {
    operations: Operation[];
    onClose: () => void;
}

const WatchlistReportModal: React.FC<WatchlistReportModalProps> = ({ operations, onClose }) => {
    const reportRef = useRef<HTMLDivElement>(null);

    const reportData = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
        const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
        
        const getStatusAtDate = (op: Operation, date: Date) => {
            if (!op.ratingHistory || op.ratingHistory.length === 0) return op.watchlist;
            
            // Find the earliest entry to determine creation date
            const creationEntry = op.ratingHistory.reduce((earliest, current) => 
                new Date(current.date) < new Date(earliest.date) ? current : earliest
            );

            // If the date we are checking is before the operation was created, it had no status.
            if (date < new Date(creationEntry.date)) {
                return null; 
            }

            const relevantHistory = op.ratingHistory
                .filter(h => new Date(h.date) <= date)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            const lastValidEntry = relevantHistory.find(h => h.watchlist);
            return lastValidEntry ? lastValidEntry.watchlist : (creationEntry.watchlist || WatchlistStatus.VERDE);
        };

        const statusValue = {
            [WatchlistStatus.VERDE]: 0,
            [WatchlistStatus.AMARELO]: 1,
            [WatchlistStatus.ROSA]: 2,
            [WatchlistStatus.VERMELHO]: 3,
        };

        const entries: { op: Operation; from: WatchlistStatus | null; to: WatchlistStatus; event: RatingHistoryEntry }[] = [];
        const worsenings: { op: Operation; from: WatchlistStatus | null; to: WatchlistStatus; event: RatingHistoryEntry }[] = [];
        const improvements: { op: Operation; from: WatchlistStatus | null; to: WatchlistStatus; event: RatingHistoryEntry }[] = [];
        const updates: { op: Operation; status: WatchlistStatus; event: RatingHistoryEntry }[] = [];

        // Summary Data
        const summary: Record<WatchlistStatus, { entries: string[], exits: string[] }> = {
            [WatchlistStatus.VERDE]: { entries: [], exits: [] },
            [WatchlistStatus.AMARELO]: { entries: [], exits: [] },
            [WatchlistStatus.ROSA]: { entries: [], exits: [] },
            [WatchlistStatus.VERMELHO]: { entries: [], exits: [] },
        };

        operations.forEach(op => {
            // Summary Calculation
            const sortedHistory = [...op.ratingHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const monthEntries = sortedHistory.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= startOfCurrentMonth && entryDate <= endOfCurrentMonth;
            });

            monthEntries.forEach(entry => {
                const entryIndex = sortedHistory.findIndex(h => h.id === entry.id);
                const prevEntry = sortedHistory[entryIndex + 1];
                const prevStatus = prevEntry ? prevEntry.watchlist : null;
                const currentStatus = entry.watchlist;

                if (prevStatus !== currentStatus) {
                    if (currentStatus) summary[currentStatus].entries.push(op.name);
                    if (prevStatus) summary[prevStatus].exits.push(op.name);
                }
            });

            // Report Details Calculation
            const historyThisMonth = op.ratingHistory
                .filter(h => {
                    const d = new Date(h.date);
                    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                })
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (historyThisMonth.length > 0) {
                const latestEvent = historyThisMonth[0];
                const statusBeforeMonth = getStatusAtDate(op, new Date(startOfCurrentMonth.getTime() - 1));
                const currentStatus = latestEvent.watchlist || op.watchlist || WatchlistStatus.VERDE;

                if (statusBeforeMonth === WatchlistStatus.VERDE && currentStatus !== WatchlistStatus.VERDE) {
                    entries.push({ op, from: statusBeforeMonth, to: currentStatus, event: latestEvent });
                } else if (statusBeforeMonth !== null && statusValue[currentStatus] > statusValue[statusBeforeMonth]) {
                    worsenings.push({ op, from: statusBeforeMonth, to: currentStatus, event: latestEvent });
                } else if (statusBeforeMonth !== null && statusValue[currentStatus] < statusValue[statusBeforeMonth]) {
                    improvements.push({ op, from: statusBeforeMonth, to: currentStatus, event: latestEvent });
                } else if (statusBeforeMonth === null) {
                    // New operation created this month
                    if (currentStatus !== WatchlistStatus.VERDE) {
                        entries.push({ op, from: WatchlistStatus.VERDE, to: currentStatus, event: latestEvent });
                    }
                } else {
                    updates.push({ op, status: currentStatus, event: latestEvent });
                }
            }
        });

        return { entries, worsenings, improvements, updates, summary };
    }, [operations]);

    const handleGeneratePDF = async () => {
        if (!reportRef.current) return;
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const canvas = await html2canvas(reportRef.current, {
                scale: 1.5, // Reduces scale from 2 to 1.5 to dramatically save resolution block size
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            // Use JPEG instead of PNG for huge file size savings
            const imgData = canvas.toDataURL('image/jpeg', 0.85); // 85% quality JPEG
            const imgWidth = canvas.width / 1.5; // adjust dimensions based on scale
            const imgHeight = canvas.height / 1.5;
            const orientation = imgWidth > imgHeight ? 'landscape' : 'portrait';

            const pdf = new jsPDF({
                orientation: orientation,
                unit: 'px',
                format: [imgWidth, imgHeight],
                compress: true // PDF internal compression
            });

            // Use 'JPEG' and 'FAST' compression for massive size reductions
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
            pdf.save(`Relatorio_Watchlist_${monthName.replace(/ /g, '_')}.pdf`);
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            alert('Falha ao gerar o PDF do relatório.');
        }
    };

    const handleCopyHtml = () => {
        if (reportRef.current) {
            // Clone the node to manipulate it before copying
            const clone = reportRef.current.cloneNode(true) as HTMLElement;
            
            // Remove any elements we don't want in the email (like buttons)
            const noEmailElements = clone.querySelectorAll('.no-email');
            noEmailElements.forEach(el => el.remove());

            const html = clone.innerHTML;
            
            const blob = new Blob([html], { type: 'text/html' });
            const clipboardItem = new ClipboardItem({ 'text/html': blob });
            navigator.clipboard.write([clipboardItem]).then(() => {
                alert('Relatório copiado para a área de transferência! Você pode colar no seu e-mail.');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Falha ao copiar o relatório. Tente selecionar o texto e copiar manualmente.');
            });
        }
    };

    const monthName = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const getStatusTagStyle = (status: WatchlistStatus | null | string) => {
        const baseStyle = { 
            display: 'inline-block', 
            padding: '2px 8px', 
            borderRadius: '9999px', 
            fontSize: '12px', 
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em'
        };
        
        switch (status) {
            case WatchlistStatus.VERDE:
                return { ...baseStyle, backgroundColor: '#dcfce7', color: '#166534' };
            case WatchlistStatus.AMARELO:
                return { ...baseStyle, backgroundColor: '#fef9c3', color: '#854d0e' };
            case WatchlistStatus.ROSA:
                return { ...baseStyle, backgroundColor: '#fce7f3', color: '#9d174d' };
            case WatchlistStatus.VERMELHO:
                return { ...baseStyle, backgroundColor: '#fee2e2', color: '#991b1b' };
            default:
                return { ...baseStyle, backgroundColor: '#f3f4f6', color: '#374151' };
        }
    };

    const renderStatusTag = (status: WatchlistStatus | null | string) => {
        if (!status) return <span style={getStatusTagStyle(null)}>N/A</span>;
        return <span style={getStatusTagStyle(status)}>{status}</span>;
    };

    const renderSection = (title: string, items: any[], type: 'entry' | 'worsening' | 'improvement' | 'update') => {
        if (items.length === 0) return null;
        return (
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '12px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>{title}</h3>
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                    {items.map((item, idx) => {
                        const event = item.op.events.find((e: any) => e.id === item.event.eventId);
                        return (
                            <li key={idx} style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                                <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: '8px' }}>
                                    <tbody>
                                        <tr>
                                            <td align="left" valign="top">
                                                <strong style={{ color: '#111827', fontSize: '16px' }}>{item.op.name}</strong>
                                            </td>
                                            <td align="right" valign="top">
                                                {type !== 'update' ? (
                                                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563', whiteSpace: 'nowrap' }}>
                                                        {renderStatusTag(item.from)} 
                                                        <span style={{ color: '#9ca3af', margin: '0 8px' }}>&rarr;</span> 
                                                        {renderStatusTag(item.to)}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563', whiteSpace: 'nowrap' }}>
                                                        Mantido em {renderStatusTag(item.status)}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                {event ? (
                                    <div style={{ fontSize: '14px', color: '#374151', marginTop: '8px' }} dangerouslySetInnerHTML={{ __html: event.description }} />
                                ) : (
                                    <p style={{ fontSize: '14px', color: '#6b7280', fontStyle: 'italic', marginTop: '8px' }}>Sem descrição detalhada.</p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    const renderSummaryBox = () => {
        const statuses = [WatchlistStatus.VERMELHO, WatchlistStatus.ROSA, WatchlistStatus.AMARELO, WatchlistStatus.VERDE];
        const statusTitles = {
            [WatchlistStatus.VERDE]: 'Verde',
            [WatchlistStatus.AMARELO]: 'Amarelo',
            [WatchlistStatus.ROSA]: 'Rosa',
            [WatchlistStatus.VERMELHO]: 'Vermelho',
        };
        const statusColors = {
            [WatchlistStatus.VERDE]: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
            [WatchlistStatus.AMARELO]: { bg: '#fefce8', border: '#fef08a', text: '#854d0e' },
            [WatchlistStatus.ROSA]: { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d' },
            [WatchlistStatus.VERMELHO]: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
        };

        return (
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px', textAlign: 'center' }}>Resumo de Movimentações</h3>
                <table width="100%" cellPadding={0} cellSpacing={0} style={{ tableLayout: 'fixed', width: '100%' }}>
                    <tbody>
                        <tr>
                            {statuses.map((status, index) => {
                                const data = reportData.summary[status];
                                const colors = statusColors[status];
                                return (
                                    <td key={status} valign="top" style={{ width: '25%', padding: index === 0 ? '0 8px 0 0' : index === statuses.length - 1 ? '0 0 0 8px' : '0 8px' }}>
                                        <div style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '16px', height: '100%' }}>
                                            <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: colors.text, borderBottom: `1px solid ${colors.border}`, paddingBottom: '8px' }}>
                                                {statusTitles[status]}
                                            </h4>
                                            
                                            <div style={{ marginBottom: '12px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, textTransform: 'uppercase', marginBottom: '4px', opacity: 0.8 }}>Entradas ({data.entries.length})</div>
                                                {data.entries.length > 0 ? (
                                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: colors.text }}>
                                                        {data.entries.map((op, i) => <li key={i}>{op}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span style={{ fontSize: '13px', color: colors.text, opacity: 0.6 }}>-</span>
                                                )}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, textTransform: 'uppercase', marginBottom: '4px', opacity: 0.8 }}>Saídas ({data.exits.length})</div>
                                                {data.exits.length > 0 ? (
                                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: colors.text }}>
                                                        {data.exits.map((op, i) => <li key={i}>{op}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span style={{ fontSize: '13px', color: colors.text, opacity: 0.6 }}>-</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <Modal 
            isOpen={true} 
            onClose={onClose} 
            title={`Relatório de Watchlist - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`}
            maxWidth="max-w-5xl"
        >
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Gere o PDF do relatório ou copie o conteúdo formatado para colar direto no seu e-mail.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={handleGeneratePDF}
                        className="px-4 py-2 border border-blue-600 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors shadow-sm font-medium flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Gerar PDF
                    </button>
                    <button 
                        onClick={handleCopyHtml}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                        Copiar para E-mail
                    </button>
                </div>
            </div>
            
            <div className="max-h-[70vh] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
                {/* This is the content that will be copied */}
                <div ref={reportRef} style={{ fontFamily: 'Arial, sans-serif', color: '#1f2937', backgroundColor: '#ffffff', padding: '24px', borderRadius: '8px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px', textAlign: 'center', color: '#111827' }}>
                        Resumo do Watchlist - {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                    </h1>

                    {renderSummaryBox()}

                    {renderSection('Entradas no Watchlist', reportData.entries, 'entry')}
                    {renderSection('Pioras de Rating', reportData.worsenings, 'worsening')}
                    {renderSection('Melhoras de Rating / Saídas', reportData.improvements, 'improvement')}
                    {renderSection('Atualizações Relevantes (Manutenção)', reportData.updates, 'update')}

                    {reportData.entries.length === 0 && reportData.worsenings.length === 0 && reportData.improvements.length === 0 && reportData.updates.length === 0 && (
                        <p style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', margin: '32px 0' }}>Nenhuma alteração registrada neste mês.</p>
                    )}

                    <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px', textAlign: 'center' }}>Histórico Recente (Últimos 3 Meses)</h3>
                        
                        {/* We render a static version of the chart for the email */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #e5e7eb', color: '#4b5563' }}>Operação</th>
                                        {/* Generate last 3 months headers */}
                                        {[2, 1, 0].map(i => {
                                            const d = new Date();
                                            d.setMonth(d.getMonth() - i);
                                            return (
                                                <th key={i} style={{ textAlign: 'center', padding: '8px', borderBottom: '2px solid #e5e7eb', color: '#4b5563', textTransform: 'capitalize' }}>
                                                    {d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' })}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {operations
                                        .filter(op => op.ratingHistory && op.ratingHistory.length > 0)
                                        .sort((a, b) => {
                                            const statusOrder: Record<string, number> = {
                                                [WatchlistStatus.VERMELHO]: 0,
                                                [WatchlistStatus.ROSA]: 1,
                                                [WatchlistStatus.AMARELO]: 2,
                                                [WatchlistStatus.VERDE]: 3,
                                            };
                                            const statusA = a.watchlist || WatchlistStatus.VERDE;
                                            const statusB = b.watchlist || WatchlistStatus.VERDE;
                                            return (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
                                        })
                                        .map(op => {
                                            // Helper to get status at end of month
                                            const getStatusForMonth = (operation: Operation, monthEndDate: Date): WatchlistStatus | null => {
                                                if (!operation.ratingHistory || operation.ratingHistory.length === 0) return null;
                                                const creationEntry = operation.ratingHistory.reduce((earliest, current) => 
                                                    new Date(current.date) < new Date(earliest.date) ? current : earliest
                                                );
                                                if (monthEndDate < new Date(creationEntry.date)) return null; 
                                                const relevantHistory = operation.ratingHistory
                                                    .filter(h => new Date(h.date) <= monthEndDate)
                                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                                const lastValidEntry = relevantHistory.find(h => h.watchlist);
                                                return lastValidEntry ? lastValidEntry.watchlist : (creationEntry.watchlist || null);
                                            };

                                            const statuses = [2, 1, 0].map(i => {
                                                const d = new Date();
                                                d.setMonth(d.getMonth() - i + 1);
                                                d.setDate(0); // Last day of that month
                                                return getStatusForMonth(op, d);
                                            });

                                            // Only show operations that were in watchlist at least once in the last 3 months
                                            if (!statuses.some(s => s && s !== WatchlistStatus.VERDE)) return null;

                                            const statusColors: Record<string, string> = {
                                                [WatchlistStatus.VERDE]: '#22c55e',
                                                [WatchlistStatus.AMARELO]: '#facc15',
                                                [WatchlistStatus.ROSA]: '#ec4899',
                                                [WatchlistStatus.VERMELHO]: '#dc2626',
                                            };

                                            return (
                                                <tr key={op.id}>
                                                    <td style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb', fontWeight: 500, color: '#111827' }}>{op.name}</td>
                                                    {statuses.map((status, idx) => (
                                                        <td key={idx} style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                                                            {status ? (
                                                                <div style={{ 
                                                                    color: statusColors[status],
                                                                    fontSize: '22px',
                                                                    lineHeight: '16px',
                                                                    margin: '0 auto',
                                                                    textAlign: 'center'
                                                                }} title={status}>&#9679;</div>
                                                            ) : (
                                                                <div style={{ 
                                                                    color: '#d1d5db',
                                                                    fontSize: '14px',
                                                                    lineHeight: '16px',
                                                                    margin: '0 auto',
                                                                    textAlign: 'center'
                                                                }} title="Sem dados">&#9679;</div>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', marginTop: '16px' }}>
                            * Apenas operações que estiveram no watchlist (Amarelo, Rosa ou Vermelho) nos últimos 3 meses são exibidas.
                        </p>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default WatchlistReportModal;
