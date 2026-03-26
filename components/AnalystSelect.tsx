import React, { useState, useEffect } from 'react';
import { Select, Input } from './UI';
import { fetchApi } from '../utils/api';

interface AnalystSelectProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    apiUrl?: string;
    required?: boolean;
    className?: string;
    placeholder?: string;
}

const AnalystSelect: React.FC<AnalystSelectProps> = ({ id, value, onChange, apiUrl, required, className, placeholder }) => {
    const [analysts, setAnalysts] = useState<string[]>([]);
    const [isNew, setIsNew] = useState(false);

    useEffect(() => {
        const fetchAnalysts = async () => {
            try {
                const effectiveApiUrl = apiUrl || '';
                const response = await fetchApi(`${effectiveApiUrl}/api/analysts`);
                if (response.ok) {
                    const data = await response.json();
                    setAnalysts(data);
                }
            } catch (error) {
                console.error("Failed to fetch analysts", error);
            }
        };
        fetchAnalysts();
    }, [apiUrl]);

    // Handle initial custom values that might not be in the fetched DB list yet
    useEffect(() => {
        if (value && analysts.length > 0 && !analysts.includes(value) && !isNew) {
            setAnalysts(prev => [...prev, value].sort());
        }
    }, [value, analysts, isNew]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'new') {
            setIsNew(true);
            onChange(''); // Clear the selected value so the user can type
        } else {
            setIsNew(false);
            onChange(val);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    return (
        <div className={`flex flex-col gap-2 ${className || ''}`}>
            <Select id={id} value={isNew ? 'new' : value} onChange={handleSelectChange} required={required && !isNew}>
                <option value="" disabled>{placeholder || '-- Selecione um Analista --'}</option>
                {analysts.map(analyst => (
                    <option key={analyst} value={analyst}>{analyst}</option>
                ))}
                <option value="new" className="font-bold text-blue-600 dark:text-blue-400">+ Adicionar Novo Analista</option>
            </Select>
            {isNew && (
                <Input 
                    type="text" 
                    placeholder="Digite o nome do novo analista" 
                    value={value} 
                    onChange={handleInputChange} 
                    required={required}
                    autoFocus
                />
            )}
        </div>
    );
};

export default AnalystSelect;
