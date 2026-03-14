import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings2, Link2, GitBranch, BookOpen, Save, CheckCircle2, AlertCircle } from "lucide-react";
import type { IntegrationConfig } from "@/lib/types";

export default function Settings() {
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery<IntegrationConfig>({
    queryKey: ["/api/config/integrations"],
  });

  const [form, setForm] = useState<IntegrationConfig>({
    jira: { enabled: false, baseUrl: "", email: "", apiToken: "", projects: [] },
    github: { enabled: false, token: "", repos: [] },
    confluence: { enabled: false, baseUrl: "", email: "", apiToken: "", spaceKeys: [] },
  });

  const [projectsInput, setProjectsInput] = useState("");
  const [reposInput, setReposInput] = useState("");
  const [spacesInput, setSpacesInput] = useState("");

  useEffect(() => {
    if (config) {
      setForm(config);
      setProjectsInput((config.jira.projects || []).join(", "));
      setReposInput((config.github.repos || []).join(", "));
      setSpacesInput((config.confluence.spaceKeys || []).join(", "));
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: IntegrationConfig) => {
      const res = await apiRequest("PUT", "/api/config/integrations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config/integrations"] });
      toast({ title: "Settings saved", description: "Integration configuration updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const updated: IntegrationConfig = {
      jira: {
        ...form.jira,
        projects: projectsInput.split(",").map(s => s.trim()).filter(Boolean),
      },
      github: {
        ...form.github,
        repos: reposInput.split(",").map(s => s.trim()).filter(Boolean),
      },
      confluence: {
        ...form.confluence,
        spaceKeys: spacesInput.split(",").map(s => s.trim()).filter(Boolean),
      },
    };
    saveMutation.mutate(updated);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="page-title">
          <Settings2 className="w-5 h-5" />
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your tools to enrich test plans with real ticket context, PR diffs, and historical patterns.
        </p>
      </div>

      <div className="bg-muted/30 border rounded-lg p-4 text-sm text-muted-foreground">
        <p>
          Without credentials configured, the companion uses intelligent mock data
          that simulates realistic integration responses. Configure real credentials
          to pull live context from your team's tools.
        </p>
      </div>

      {/* Jira */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-sm">Jira</CardTitle>
                <CardDescription className="text-xs">Ticket fetch and context merge</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge enabled={form.jira.enabled} />
              <Switch
                checked={form.jira.enabled}
                onCheckedChange={(v) => setForm(f => ({ ...f, jira: { ...f.jira, enabled: v } }))}
                data-testid="switch-jira"
              />
            </div>
          </div>
        </CardHeader>
        {form.jira.enabled && (
          <CardContent className="space-y-3 pt-0">
            <Separator />
            <FieldRow label="Base URL" placeholder="https://your-company.atlassian.net"
              value={form.jira.baseUrl || ""}
              onChange={(v) => setForm(f => ({ ...f, jira: { ...f.jira, baseUrl: v } }))}
              testId="input-jira-url"
            />
            <FieldRow label="Email" placeholder="your@email.com"
              value={form.jira.email || ""}
              onChange={(v) => setForm(f => ({ ...f, jira: { ...f.jira, email: v } }))}
              testId="input-jira-email"
            />
            <FieldRow label="API Token" placeholder="ATATT3..."
              value={form.jira.apiToken || ""}
              onChange={(v) => setForm(f => ({ ...f, jira: { ...f.jira, apiToken: v } }))}
              type="password"
              testId="input-jira-token"
            />
            <FieldRow label="Projects" placeholder="PROJ, BACKEND (comma-separated)"
              value={projectsInput}
              onChange={setProjectsInput}
              testId="input-jira-projects"
            />
          </CardContent>
        )}
      </Card>

      {/* GitHub */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <GitBranch className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-sm">GitHub</CardTitle>
                <CardDescription className="text-xs">PR diff analysis and review comments</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge enabled={form.github.enabled} />
              <Switch
                checked={form.github.enabled}
                onCheckedChange={(v) => setForm(f => ({ ...f, github: { ...f.github, enabled: v } }))}
                data-testid="switch-github"
              />
            </div>
          </div>
        </CardHeader>
        {form.github.enabled && (
          <CardContent className="space-y-3 pt-0">
            <Separator />
            <FieldRow label="Personal Access Token" placeholder="ghp_..."
              value={form.github.token || ""}
              onChange={(v) => setForm(f => ({ ...f, github: { ...f.github, token: v } }))}
              type="password"
              testId="input-github-token"
            />
            <FieldRow label="Repositories" placeholder="org/repo-name (comma-separated)"
              value={reposInput}
              onChange={setReposInput}
              testId="input-github-repos"
            />
          </CardContent>
        )}
      </Card>

      {/* Confluence */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <CardTitle className="text-sm">Confluence</CardTitle>
                <CardDescription className="text-xs">Historical patterns and documentation</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge enabled={form.confluence.enabled} />
              <Switch
                checked={form.confluence.enabled}
                onCheckedChange={(v) => setForm(f => ({ ...f, confluence: { ...f.confluence, enabled: v } }))}
                data-testid="switch-confluence"
              />
            </div>
          </div>
        </CardHeader>
        {form.confluence.enabled && (
          <CardContent className="space-y-3 pt-0">
            <Separator />
            <FieldRow label="Base URL" placeholder="https://your-company.atlassian.net/wiki"
              value={form.confluence.baseUrl || ""}
              onChange={(v) => setForm(f => ({ ...f, confluence: { ...f.confluence, baseUrl: v } }))}
              testId="input-confluence-url"
            />
            <FieldRow label="Email" placeholder="your@email.com"
              value={form.confluence.email || ""}
              onChange={(v) => setForm(f => ({ ...f, confluence: { ...f.confluence, email: v } }))}
              testId="input-confluence-email"
            />
            <FieldRow label="API Token" placeholder="ATATT3..."
              value={form.confluence.apiToken || ""}
              onChange={(v) => setForm(f => ({ ...f, confluence: { ...f.confluence, apiToken: v } }))}
              type="password"
              testId="input-confluence-token"
            />
            <FieldRow label="Space Keys" placeholder="ENG, QA (comma-separated)"
              value={spacesInput}
              onChange={setSpacesInput}
              testId="input-confluence-spaces"
            />
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-1.5"
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="default" className="text-[10px] h-5 gap-1">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px] h-5 gap-1">
      <AlertCircle className="w-2.5 h-2.5" />
      Mock
    </Badge>
  );
}

function FieldRow({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  testId,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  testId?: string;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
        data-testid={testId}
      />
    </div>
  );
}
