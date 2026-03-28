
import React, { useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ChevronDownIcon, ChevronUpIcon } from './icons/Icons';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  height?: string | number;
}

const simpleModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['link', 'clean'],
  ],
};

const fullModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['link', 'blockquote', 'code-block'],
    ['clean'],
  ],
};

const formats = [
  'header', 'font',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'script',
  'list', 'indent',
  'direction', 'align',
  'link', 'blockquote', 'code-block',
];

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, className, placeholder, height }) => {
  const [showFullToolbar, setShowFullToolbar] = useState(false);

  return (
    <div className={`flex flex-col border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 overflow-hidden ${className}`} style={{ height: height || 'auto' }}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Editor de Texto</span>
        <button 
          type="button"
          onClick={() => setShowFullToolbar(!showFullToolbar)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 transition-colors"
        >
          {showFullToolbar ? (
            <>Menos Opções <ChevronUpIcon className="w-3 h-3" /></>
          ) : (
            <>Mais Opções <ChevronDownIcon className="w-3 h-3" /></>
          )}
        </button>
      </div>
      <div className="flex-1 quill-container dark:text-gray-100">
        <ReactQuill
          key={showFullToolbar ? 'full' : 'simple'}
          theme="snow"
          value={value}
          onChange={onChange}
          modules={showFullToolbar ? fullModules : simpleModules}
          formats={formats}
          placeholder={placeholder}
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        />
      </div>
      <style>{`
        .quill-container .ql-toolbar.ql-snow {
          border: none;
          border-bottom: 1px solid #e5e7eb;
          background: #fdfdfd;
          padding: 8px;
        }
        .dark .quill-container .ql-toolbar.ql-snow {
          border-bottom: 1px solid #374151;
          background: #1f2937;
        }
        .dark .quill-container .ql-stroke {
          stroke: #d1d5db;
        }
        .dark .quill-container .ql-fill {
          fill: #d1d5db;
        }
        .dark .quill-container .ql-picker {
          color: #d1d5db;
        }
        .quill-container .ql-container.ql-snow {
          border: none;
          flex: 1;
          overflow-y: auto;
          font-family: inherit;
          font-size: 0.875rem;
        }
        .quill-container .ql-editor {
          min-height: 100px;
        }
        .dark .quill-container .ql-editor.ql-blank::before {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
