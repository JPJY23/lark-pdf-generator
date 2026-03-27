import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getTenantAccessToken,
  listTables,
  getTableFields,
  listRecords,
  updateRecord,
  uploadMedia,
} from "@/lib/lark-api";
import ServiceReport from "@/components/ServiceReport";
import { Loader2, CheckCircle, Key, Database, RefreshCw, Send } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface TableInfo {
  table_id: string;
  name: string;
}

export default function Index() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [token, setToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [progress, setProgress] = useState("");
  const sendingRef = useRef(false);

  // When token and appToken are set, fetch tables
  useEffect(() => {
    if (!token || !appToken) return;
    listTables(token, appToken)
      .then(setTables)
      .catch((e) => toast.error("Failed to list tables: " + e.message));
  }, [token, appToken]);

  // When table is selected, fetch records
  useEffect(() => {
    if (!token || !appToken || !selectedTableId) return;
    fetchRecords();
  }, [selectedTableId]);

  const handleAuth = async () => {
    if (!appId || !appSecret) return toast.error("Enter App ID and App Secret");
    setLoading(true);
    try {
      setProgress("Authenticating…");
      const t = await getTenantAccessToken(appId, appSecret);
      setToken(t);
      toast.success("Authenticated successfully");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const fetchRecords = useCallback(async () => {
    if (!token || !appToken || !selectedTableId) return;
    setLoading(true);
    try {
      setProgress("Fetching records…");
      const items = await listRecords(token, appToken, selectedTableId);
      setRecords(items);
      toast.success(`Fetched ${items.length} records`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [token, appToken, selectedTableId]);

  const generatePdfBase64 = async (recordId: string): Promise<string> => {
    const el = document.getElementById(`report-${recordId}`);
    if (!el) throw new Error("Report element not found");
    const canvas = await html2canvas(el, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10;

    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
    }

    return pdf.output("datauristring").split(",")[1];
  };

  const sendAllPdfs = async () => {
    if (sendingRef.current || records.length === 0) return;
    sendingRef.current = true;
    setSendingAll(true);

    // Filter: only send if "Report Summary" field is empty/missing
    const recordsToSend = records.filter((record) => {
      const reportSummary = record.fields?.["Report Summary"];
      return !reportSummary || (Array.isArray(reportSummary) && reportSummary.length === 0);
    });

    if (recordsToSend.length === 0) {
      toast.info("All records already have a Report Summary — nothing to send.");
      setSendingAll(false);
      sendingRef.current = false;
      return;
    }

    let success = 0;
    for (let i = 0; i < recordsToSend.length; i++) {
      const record = recordsToSend[i];
      const id = record.record_id;
      setProgress(`Generating & sending PDF ${i + 1}/${recordsToSend.length}…`);
      try {
        const pdfBase64 = await generatePdfBase64(id);
        const companyName = record.fields?.["Company Name"] || "report";
        const fileName = `Service_Report_${companyName}_${Date.now()}.pdf`;
        const fileToken = await uploadMedia(token, appToken, fileName, pdfBase64);
        await updateRecord(token, appToken, selectedTableId, id, {
          "Report Summary": [{ file_token: fileToken, name: fileName, type: "application/pdf" }],
        });
        success++;
      } catch (e: any) {
        console.error(`Failed to send PDF for ${id}:`, e.message);
      }
    }

    toast.success(`Sent ${success}/${recordsToSend.length} PDFs to Lark`);
    setSendingAll(false);
    sendingRef.current = false;
    setProgress("");
  };

  const handleUpdate = async () => {
    if (!token || !appToken || !selectedTableId) return toast.error("Select a table first");
    await fetchRecords();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container max-w-5xl py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">AV</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">Autovex Service Reports</h1>
              <p className="text-xs text-muted-foreground">Lark Bitable Integration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {token && selectedTableId && (
              <>
                <Button onClick={handleUpdate} disabled={loading || sendingAll} variant="outline" size="sm">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button onClick={sendAllPdfs} disabled={loading || sendingAll || records.length === 0} size="sm">
                  {sendingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send PDFs to Lark
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-5xl py-8 space-y-6">
        {/* Credentials */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Lark Credentials</h2>
            {token && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
          </div>
          {!token ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="appId">App ID</Label>
                <Input
                  id="appId"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="cli_xxxxx..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appSecret">App Secret</Label>
                <Input
                  id="appSecret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="Enter app secret"
                />
              </div>
              <Button onClick={handleAuth} disabled={loading || !appId || !appSecret}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Authenticate
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Authenticated ✓</p>
          )}
        </Card>

        {/* App Token & Table Selection */}
        {token && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Select App & Table</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="appToken">App Token</Label>
                <Input
                  id="appToken"
                  value={appToken}
                  onChange={(e) => {
                    setAppToken(e.target.value);
                    setSelectedTableId("");
                    setTables([]);
                    setRecords([]);
                  }}
                  placeholder="bascnxxxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Table</Label>
                <Select
                  value={selectedTableId}
                  onValueChange={setSelectedTableId}
                  disabled={tables.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tables.length === 0 ? "Enter app token first" : "Select a table"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((t) => (
                      <SelectItem key={t.table_id} value={t.table_id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}

        {/* Progress */}
        {(loading || sendingAll) && progress && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress}
          </div>
        )}

        {/* Records */}
        {records.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-lg">{records.length} Service Report{records.length > 1 ? 's' : ''}</h2>
            </div>
            {records.map((record, i) => (
              <div key={record.record_id || i} className="shadow-md rounded-lg overflow-hidden border border-border">
                <ServiceReport record={record} recordId={record.record_id} token={token} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}