import { useEffect, useState } from "react";
import { batchDownloadMedia } from "@/lib/lark-api";
import { Loader2 } from "lucide-react";
import autovexLogo from "@/assets/autovex-logo.png";

interface ServiceReportProps {
  record: Record<string, any>;
  recordId: string;
  token?: string;
}

/**
 * Format a Lark date field value.
 * Lark stores DateTime fields as Unix timestamps in milliseconds.
 */
function formatDateValue(val: any): string {
  if (val === undefined || val === null) return '';
  // If it's a number (Unix timestamp in ms), format it
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    return String(val);
  }
  // If it's a string that looks like a Unix timestamp, try parsing
  if (typeof val === 'string' && /^\d{10,13}$/.test(val)) {
    const ts = val.length === 10 ? Number(val) * 1000 : Number(val);
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }
  if (typeof val === 'string') return val;
  return String(val);
}

/**
 * Extract text from a Lark rich text / multi-line text field.
 * Lark can return these in various structures:
 * - Simple string
 * - Array of segments: [{type: "text", text: "..."}, ...]
 * - Array of paragraphs: [{type: "paragraph", children: [{text: "..."}]}]
 * - Object with nested content
 */
function extractRichText(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);

  if (Array.isArray(val)) {
    const parts = val.map((v: any) => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object' && v !== null) {
        // Lark text segments: {type: "text", text: "content"}
        if (typeof v.text === 'string') return v.text;
        // Lark link segments: {type: "url", link: "...", text: "..."}
        if (v.link && typeof v.link === 'string') return v.text || v.link;
        // Paragraph with children
        if (v.children && Array.isArray(v.children)) {
          return v.children.map((c: any) => {
            if (typeof c === 'string') return c;
            if (typeof c.text === 'string') return c.text;
            return '';
          }).join('');
        }
        // Nested content/value
        if (v.content !== undefined) return extractRichText(v.content);
        if (v.value !== undefined) return extractRichText(v.value);
        // Fallback: try to get any string property
        for (const key of ['text', 'name', 'label', 'title', 'display_value']) {
          if (typeof v[key] === 'string') return v[key];
        }
      }
      return '';
    }).filter(Boolean);
    return parts.join('');
  }

  if (typeof val === 'object') {
    // Direct text property
    if (typeof val.text === 'string') return val.text;
    // Lark sometimes wraps in {value: [...]}
    if (val.value !== undefined) return extractRichText(val.value);
    if (val.content !== undefined) return extractRichText(val.content);
    // Document-style: {body: {content: [...]}}
    if (val.body?.content) return extractRichText(val.body.content);
    // Try common string properties
    for (const key of ['text', 'name', 'label', 'title', 'display_value']) {
      if (typeof val[key] === 'string') return val[key];
    }
  }

  return JSON.stringify(val);
}

function getFieldValue(fields: Record<string, any>, key: string): string {
  const val = fields[key];
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val.map((v: any) => (typeof v === 'object' && v.text ? v.text : String(v))).join('');
  }
  if (typeof val === 'object' && val.text) return val.text;
  return JSON.stringify(val);
}

function getFileTokens(fields: Record<string, any>, key: string): string[] {
  const val = fields[key];
  if (!val || !Array.isArray(val)) return [];
  return val.map((v: any) => v.file_token || v.token || '').filter(Boolean);
}

export function generateReportSummary(fields: Record<string, any>): string {
  const companyName = getFieldValue(fields, 'Company Name');
  const robotType = getFieldValue(fields, 'Robot Type');
  const robotSerial = getFieldValue(fields, 'Robot Serial Number');
  const robotIssue = getFieldValue(fields, 'Robot Issue');
  const serviceStart = formatDateValue(fields['Service Start']);
  const serviceEnd = formatDateValue(fields['Service End']);
  const serviceStatus = getFieldValue(fields, 'Service Status');
  const completedBy = getFieldValue(fields, 'Service Completed By');
  const caseInfo = extractRichText(fields['Case Information']);

  return `Service Report - ${companyName}
Robot: ${robotType} (S/N: ${robotSerial})
Issue: ${robotIssue}
Start: ${serviceStart} | End: ${serviceEnd}
Status: ${serviceStatus}
Completed By: ${completedBy}
Summary: ${caseInfo}`;
}

export default function ServiceReport({ record, recordId, token }: ServiceReportProps) {
  const fields = record.fields || record;
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(false);

  const companyName = getFieldValue(fields, 'Company Name');
  const companyAddress = getFieldValue(fields, 'Company Address');
  const contactName = getFieldValue(fields, 'Contact Name');
  const contactNumber = getFieldValue(fields, 'Contact Number');
  const robotType = getFieldValue(fields, 'Robot Type');
  const robotSerial = getFieldValue(fields, 'Robot Serial Number');
  const robotIssue = getFieldValue(fields, 'Robot Issue');
  // Use date formatter for Service Start/End
  const serviceStart = formatDateValue(fields['Service Start']);
  const serviceEnd = formatDateValue(fields['Service End']);
  // Use rich text extractor for Case Information (Engineer Report)
  const caseInfo = extractRichText(fields['Case Information']);
  const serviceStatus = getFieldValue(fields, 'Service Status');
  const completedBy = getFieldValue(fields, 'Service Completed By');

  const beforeTokens = getFileTokens(fields, 'Before Service Images');
  const afterTokens = getFileTokens(fields, 'After Service Images');
  const allTokens = [...beforeTokens, ...afterTokens];

  useEffect(() => {
    if (!token || allTokens.length === 0) return;
    let cancelled = false;
    setLoadingImages(true);
    batchDownloadMedia(token, allTokens)
      .then((map) => { if (!cancelled) setImageMap(map); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingImages(false); });
    return () => { cancelled = true; };
  }, [token, allTokens.join(',')]);

  const renderImages = (tokens: string[], label: string) => {
    if (tokens.length === 0) return <span className="font-medium text-sm">No images</span>;
    if (loadingImages) return (
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </span>
    );
    return (
      <div className="flex gap-2 flex-wrap">
        {tokens.map((ft, i) => (
          <img key={ft} src={imageMap[ft] || ''} alt={`${label} ${i + 1}`}
            className="h-20 w-20 object-cover rounded border" crossOrigin="anonymous" />
        ))}
      </div>
    );
  };

  return (
    <div id={`report-${recordId}`} className="bg-white text-black p-8 max-w-[210mm] mx-auto"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold text-black">Service Report</h1>
        <img src={autovexLogo} alt="Autovex" className="h-8 object-contain" crossOrigin="anonymous" />
      </div>
      <hr className="border-t border-gray-300 mb-6" />

      {/* Main bordered container */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Customer Information */}
        <SectionHeader>Customer Information</SectionHeader>
        <TableRow label="Company Name" value={companyName} />
        <TableRow label="Company Address" value={companyAddress} />
        <TableRow label="Contact Name" value={contactName} />
        <TableRow label="Contact Number" value={contactNumber} />

        {/* Robot Information */}
        <SectionHeader>Robot Information</SectionHeader>
        <TableRow label="Robot Type" value={robotType} />
        <TableRow label="Robot Serial Number" value={robotSerial} />
      </div>

      <div className="h-4" />

      {/* Case Information */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader>Case Information</SectionHeader>
        <TableRow label="Robot Issue" value={robotIssue} />
        <TableRow label="Service Start" value={serviceStart} />
        <TableRow label="Service End" value={serviceEnd} />
        <TableRowMultiline label="Engineer Report" value={caseInfo} />
        <TableRowCustom label="Before Service Images">
          {renderImages(beforeTokens, "Before")}
        </TableRowCustom>
        <TableRowCustom label="After Service Images">
          {renderImages(afterTokens, "After")}
        </TableRowCustom>
        <TableRow label="Service Status" value={serviceStatus || 'N/A'} />
        <TableRow label="Service Completed By" value={completedBy || 'N/A'} />
      </div>

      <p className="text-xs text-gray-500 italic mt-6">
        This is a computer generated maintenance report, no signature is required.
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
      <span className="font-bold text-sm text-black">{children}</span>
    </div>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2.5 text-sm text-gray-600">{label}</div>
      <div className="px-4 py-2.5 text-sm font-medium text-black">{value || 'N/A'}</div>
    </div>
  );
}

/** Multiline table row that preserves line breaks from rich text */
function TableRowMultiline({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2.5 text-sm text-gray-600">{label}</div>
      <div className="px-4 py-2.5 text-sm font-medium text-black whitespace-pre-wrap">
        {value || 'N/A'}
      </div>
    </div>
  );
}

function TableRowCustom({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2.5 text-sm text-gray-600">{label}</div>
      <div className="px-4 py-2.5">{children}</div>
    </div>
  );
}
