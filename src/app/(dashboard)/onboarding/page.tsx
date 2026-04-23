"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  useOnboardingPacks,
  useOnboardingAssignments,
  useCreateOnboardingPack,
  useAssignOnboarding,
  useUpdateOnboardingProgress,
  useUpdateOnboardingPack,
  useDeleteOnboardingPack,
  type StaffOnboardingData,
} from "@/hooks/useOnboarding";
import {
  useLMSCourses,
  useLMSCourse,
  useCreateLMSCourse,
  useEnrollStaff,
  useUnenrollStaff,
  useUpdateModuleProgress,
} from "@/hooks/useLMS";
import { ExitSurveyDashboard } from "@/components/exit-surveys/ExitSurveyDashboard";
import { OnboardingPacksTab } from "@/components/onboarding/OnboardingPacksTab";
import { LmsCoursesTab } from "@/components/onboarding/LmsCoursesTab";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  Plus,
  X,
  Users,
  ClipboardList,
  Sparkles,
  ClipboardCheck,
  Download,
} from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { hasMinRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  serviceId?: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasMinRole(role, "admin");
  const isOwner = role === "owner";
  const isStaff = role === "staff";
  const isServiceScoped = role === "staff" || role === "member";

  const [activeTab, setActiveTab] = useState<"onboarding" | "lms" | "exit-surveys">("onboarding");
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = useState<string | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<string>>(new Set());

  // Data
  const { data: packs = [], isLoading: packsLoading } = useOnboardingPacks();
  const { data: assignments = [], isLoading: assignmentsLoading } = useOnboardingAssignments(
    isStaff ? session?.user?.id : undefined
  );
  const { data: courses = [], isLoading: coursesLoading } = useLMSCourses();
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });
  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });
  const { data: selectedPackData, isLoading: selectedPackLoading } = useQuery<{
    id: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    tasks: { id: string; title: string; category: string; isRequired: boolean; sortOrder: number }[];
  }>({
    queryKey: ["onboarding-pack-detail", selectedPackId],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding/packs/${selectedPackId}`);
      if (!res.ok) throw new Error("Failed to fetch pack details");
      return res.json();
    },
    enabled: !!selectedPackId,
  });
  const { data: selectedCourseData, isLoading: selectedCourseLoading } = useLMSCourse(selectedCourseId);

  const createPack = useCreateOnboardingPack();
  const editPackMutation = useUpdateOnboardingPack();
  const deletePackMutation = useDeleteOnboardingPack();
  const createCourse = useCreateLMSCourse();
  const assignPack = useAssignOnboarding();
  const updateProgress = useUpdateOnboardingProgress();
  const enrollStaff = useEnrollStaff();
  const unenrollStaff = useUnenrollStaff();
  const updateModuleProgress = useUpdateModuleProgress();

  // Edit pack state
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editPackName, setEditPackName] = useState("");
  const [editPackDesc, setEditPackDesc] = useState("");
  const [confirmDeletePackId, setConfirmDeletePackId] = useState<string | null>(null);

  function startEditPack(pack: { id: string; name: string; description: string | null }) {
    setEditingPackId(pack.id);
    setEditPackName(pack.name);
    setEditPackDesc(pack.description ?? "");
  }

  async function saveEditPack() {
    if (!editingPackId || !editPackName.trim()) return;
    await editPackMutation.mutateAsync({ id: editingPackId, name: editPackName, description: editPackDesc || null });
    setEditingPackId(null);
  }

  async function handleDeletePack(id: string) {
    await deletePackMutation.mutateAsync(id);
    setConfirmDeletePackId(null);
    if (selectedPackId === id) setSelectedPackId(null);
  }

  // Form state
  const [packForm, setPackForm] = useState({ name: "", description: "", serviceId: "", isDefault: false, tasks: [{ title: "", description: "", category: "general", isRequired: true }] });
  const [courseForm, setCourseForm] = useState({ title: "", description: "", category: "", isRequired: false, serviceId: "" });
  const [assignForm, setAssignForm] = useState({ userId: "", packId: "", dueDate: "" });
  const [enrollForm, setEnrollForm] = useState<{ userIds: string[]; dueDate: string }>({ userIds: [], dueDate: "" });

  const handleCreatePack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packForm.name || packForm.tasks.length === 0) return;
    await createPack.mutateAsync({
      name: packForm.name,
      description: packForm.description || undefined,
      serviceId: packForm.serviceId || null,
      isDefault: packForm.isDefault,
      tasks: packForm.tasks.filter(t => t.title.trim()).map((t, i) => ({ ...t, sortOrder: i })),
    });
    setPackForm({ name: "", description: "", serviceId: "", isDefault: false, tasks: [{ title: "", description: "", category: "general", isRequired: true }] });
    setShowCreatePack(false);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.title) return;
    await createCourse.mutateAsync({
      title: courseForm.title,
      description: courseForm.description || undefined,
      category: courseForm.category || undefined,
      isRequired: courseForm.isRequired,
      serviceId: courseForm.serviceId || null,
    });
    setCourseForm({ title: "", description: "", category: "", isRequired: false, serviceId: "" });
    setShowCreateCourse(false);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.userId || !assignForm.packId) return;
    try {
      await assignPack.mutateAsync({
        userId: assignForm.userId,
        packId: assignForm.packId,
        dueDate: assignForm.dueDate || undefined,
      });
      setAssignForm({ userId: "", packId: "", dueDate: "" });
      setShowAssign(false);
    } catch {
      // error handled by mutation
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || enrollForm.userIds.length === 0) return;
    try {
      await enrollStaff.mutateAsync({
        courseId: selectedCourseId,
        userIds: enrollForm.userIds,
        dueDate: enrollForm.dueDate || undefined,
      });
      setEnrollForm({ userIds: [], dueDate: "" });
      setShowEnroll(false);
    } catch {
      // error handled by mutation
    }
  };

  const handleUnenroll = async (enrollmentId: string) => {
    try {
      await unenrollStaff.mutateAsync(enrollmentId);
    } catch {
      // error handled by mutation
    }
  };

  const handleModuleProgress = async (enrollmentId: string, moduleId: string, completed: boolean) => {
    try {
      await updateModuleProgress.mutateAsync({ enrollmentId, moduleId, completed });
    } catch {
      // error handled by mutation
    }
  };

  // Seeding state (owner only)
  const [seedingPacks, setSeedingPacks] = useState(false);
  const [seedingCourses, setSeedingCourses] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const handleSeedPacks = async () => {
    setSeedingPacks(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/onboarding/seed", { method: "POST" });
      const data = await res.json();
      setSeedMessage(data.message || "Packs seeded!");
      queryClient.invalidateQueries({ queryKey: ["onboarding-packs"] });
    } catch {
      setSeedMessage("Failed to seed packs.");
    } finally {
      setSeedingPacks(false);
    }
  };

  const handleSeedCourses = async () => {
    setSeedingCourses(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/lms/seed", { method: "POST" });
      const data = await res.json();
      setSeedMessage(data.message || "Courses seeded!");
      queryClient.invalidateQueries({ queryKey: ["lms-courses"] });
    } catch {
      setSeedMessage("Failed to seed courses.");
    } finally {
      setSeedingCourses(false);
    }
  };

  const handleToggleTask = async (assignment: StaffOnboardingData, taskId: string, currentCompleted: boolean) => {
    await updateProgress.mutateAsync({
      onboardingId: assignment.id,
      taskId,
      completed: !currentCompleted,
    });
  };

  const isLoading = packsLoading || assignmentsLoading || coursesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-border border-t-brand rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted">Loading onboarding & training...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Onboarding & Training"
        description={isStaff
          ? "Complete your onboarding tasks and training modules."
          : "Manage onboarding packs and LMS courses for staff."}
        primaryAction={isAdmin ? {
          label: activeTab === "onboarding" ? "Create Pack" : "Create Course",
          icon: Plus,
          onClick: () => activeTab === "onboarding" ? setShowCreatePack(true) : setShowCreateCourse(true),
        } : undefined}
        secondaryActions={isAdmin ? [
          {
            label: "Assign Pack",
            icon: Users,
            onClick: () => setShowAssign(true),
          },
          {
            label: "Export",
            icon: Download,
            onClick: () => {
              if (activeTab === "onboarding") {
                exportToCsv("onboarding-assignments", assignments, [
                  { header: "Staff Member", accessor: (a) => a.user.name },
                  { header: "Email", accessor: (a) => a.user.email },
                  { header: "Pack", accessor: (a) => a.pack.name },
                  { header: "Service", accessor: (a) => a.pack.service?.name ?? "" },
                  { header: "Status", accessor: (a) => a.status },
                  { header: "Tasks Total", accessor: (a) => a.pack._count.tasks },
                  { header: "Tasks Completed", accessor: (a) => a.progress.filter((p) => p.completed).length },
                  { header: "Due Date", accessor: (a) => a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-AU") : "" },
                ]);
              } else if (activeTab === "lms") {
                exportToCsv("lms-courses", courses, [
                  { header: "Title", accessor: (c) => c.title },
                  { header: "Category", accessor: (c) => c.category ?? "" },
                  { header: "Status", accessor: (c) => c.status },
                  { header: "Required", accessor: (c) => c.isRequired ? "Yes" : "No" },
                  { header: "Modules", accessor: (c) => c._count?.modules ?? 0 },
                  { header: "Enrollments", accessor: (c) => c._count?.enrollments ?? 0 },
                ]);
              }
            },
          },
          ...(isOwner ? [{
            label: activeTab === "onboarding" ? "Seed Packs" : "Seed Training Courses",
            icon: Sparkles,
            onClick: activeTab === "onboarding" ? handleSeedPacks : handleSeedCourses,
            loading: seedingPacks || seedingCourses,
          }] : []),
        ] : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("onboarding")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "onboarding" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          )}
        >
          <ClipboardList className="w-4 h-4" />
          Onboarding
        </button>
        <button
          onClick={() => setActiveTab("lms")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "lms" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          )}
        >
          <GraduationCap className="w-4 h-4" />
          Training / LMS
        </button>
        <button
          onClick={() => setActiveTab("exit-surveys")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "exit-surveys" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
          )}
        >
          <ClipboardCheck className="w-4 h-4" />
          Exit Surveys
        </button>
      </div>

      {/* Seed Message */}
      {seedMessage && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">{seedMessage}</p>
          <button onClick={() => setSeedMessage(null)} className="ml-auto text-amber-400 hover:text-amber-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Onboarding Tab */}
      {activeTab === "onboarding" && (
        <OnboardingPacksTab
          isStaff={isStaff}
          isAdmin={isAdmin}
          assignments={assignments}
          packs={packs}
          expandedAssignment={expandedAssignment}
          setExpandedAssignment={setExpandedAssignment}
          selectedPackId={selectedPackId}
          setSelectedPackId={setSelectedPackId}
          editingPackId={editingPackId}
          setEditingPackId={setEditingPackId}
          editPackName={editPackName}
          setEditPackName={setEditPackName}
          editPackDesc={editPackDesc}
          setEditPackDesc={setEditPackDesc}
          confirmDeletePackId={confirmDeletePackId}
          setConfirmDeletePackId={setConfirmDeletePackId}
          selectedPackData={selectedPackData}
          selectedPackLoading={selectedPackLoading}
          updateProgress={updateProgress}
          editPackMutation={editPackMutation}
          deletePackMutation={deletePackMutation}
          handleToggleTask={handleToggleTask}
          startEditPack={startEditPack}
          saveEditPack={saveEditPack}
          handleDeletePack={handleDeletePack}
        />
      )}

      {/* LMS Tab */}
      {activeTab === "lms" && (
        <LmsCoursesTab
          isServiceScoped={isServiceScoped}
          isAdmin={isAdmin}
          courses={courses}
          selectedCourseId={selectedCourseId}
          setSelectedCourseId={setSelectedCourseId}
          expandedModuleId={expandedModuleId}
          setExpandedModuleId={setExpandedModuleId}
          expandedEnrollmentId={expandedEnrollmentId}
          setExpandedEnrollmentId={setExpandedEnrollmentId}
          selectedCourseData={selectedCourseData}
          selectedCourseLoading={selectedCourseLoading}
          setEnrollForm={setEnrollForm}
          setShowEnroll={setShowEnroll}
          revealedAnswers={revealedAnswers}
          setRevealedAnswers={setRevealedAnswers}
          userId={session?.user?.id}
          unenrollStaff={unenrollStaff}
          updateModuleProgress={updateModuleProgress}
          handleUnenroll={handleUnenroll}
          handleModuleProgress={handleModuleProgress}
        />
      )}
      {/* Exit Surveys Tab */}
      {activeTab === "exit-surveys" && (
        <ExitSurveyDashboard />
      )}

      {/* Create Pack Modal */}
      {showCreatePack && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Create Onboarding Pack</h3>
              <button onClick={() => setShowCreatePack(false)} className="p-1 text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreatePack} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Name *</label>
                <input type="text" value={packForm.name} onChange={(e) => setPackForm({ ...packForm, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="E.g., New Staff Induction Pack" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Description</label>
                <textarea value={packForm.description} onChange={(e) => setPackForm({ ...packForm, description: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Centre (Optional)</label>
                  <select value={packForm.serviceId} onChange={(e) => setPackForm({ ...packForm, serviceId: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Company-wide</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={packForm.isDefault} onChange={(e) => setPackForm({ ...packForm, isDefault: e.target.checked })} className="rounded border-border text-brand focus:ring-brand" />
                    Default pack for new staff
                  </label>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground/80">Tasks</label>
                  <button type="button" onClick={() => setPackForm({ ...packForm, tasks: [...packForm.tasks, { title: "", description: "", category: "general", isRequired: true }] })} className="text-xs text-brand hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Task
                  </button>
                </div>
                <div className="space-y-2">
                  {packForm.tasks.map((task, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => {
                          const tasks = [...packForm.tasks];
                          tasks[i] = { ...tasks[i], title: e.target.value };
                          setPackForm({ ...packForm, tasks });
                        }}
                        className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                        placeholder={`Task ${i + 1}...`}
                      />
                      <select
                        value={task.category}
                        onChange={(e) => {
                          const tasks = [...packForm.tasks];
                          tasks[i] = { ...tasks[i], category: e.target.value };
                          setPackForm({ ...packForm, tasks });
                        }}
                        className="px-2 py-2 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand"
                      >
                        <option value="general">General</option>
                        <option value="documentation">Documentation</option>
                        <option value="training">Training</option>
                        <option value="compliance">Compliance</option>
                        <option value="it_setup">IT Setup</option>
                      </select>
                      {packForm.tasks.length > 1 && (
                        <button type="button" onClick={() => setPackForm({ ...packForm, tasks: packForm.tasks.filter((_, j) => j !== i) })} className="p-1 text-muted hover:text-danger">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowCreatePack(false)} className="flex-1 px-4 py-2.5 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={createPack.isPending} className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                  {createPack.isPending ? "Creating..." : "Create Pack"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Course Modal */}
      {showCreateCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Create Training Course</h3>
              <button onClick={() => setShowCreateCourse(false)} className="p-1 text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Title *</label>
                <input type="text" value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="E.g., Workplace Health & Safety" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Description</label>
                <textarea value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Category</label>
                  <input type="text" value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="E.g., Safety, Compliance" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Centre (Optional)</label>
                  <select value={courseForm.serviceId} onChange={(e) => setCourseForm({ ...courseForm, serviceId: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Company-wide</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={courseForm.isRequired} onChange={(e) => setCourseForm({ ...courseForm, isRequired: e.target.checked })} className="rounded border-border text-brand focus:ring-brand" />
                Required course for all staff
              </label>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowCreateCourse(false)} className="flex-1 px-4 py-2.5 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={createCourse.isPending} className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                  {createCourse.isPending ? "Creating..." : "Create Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Pack Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Assign Onboarding Pack</h3>
              <button onClick={() => setShowAssign(false)} className="p-1 text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Staff Member *</label>
                <select value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" required>
                  <option value="">Select user...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Onboarding Pack *</label>
                <select value={assignForm.packId} onChange={(e) => setAssignForm({ ...assignForm, packId: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" required>
                  <option value="">Select pack...</option>
                  {packs.map(p => <option key={p.id} value={p.id}>{p.name} ({p._count.tasks} tasks)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Due Date (Optional)</label>
                <input type="date" value={assignForm.dueDate} onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              {assignPack.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {(assignPack.error as Error).message}
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowAssign(false)} className="flex-1 px-4 py-2.5 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={assignPack.isPending} className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                  {assignPack.isPending ? "Assigning..." : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enrol Staff Modal */}
      {showEnroll && selectedCourseData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Enrol Staff</h3>
                <p className="text-sm text-muted mt-0.5">{selectedCourseData.title}</p>
              </div>
              <button onClick={() => setShowEnroll(false)} className="p-1 text-muted hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEnroll} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">Select Staff Members *</label>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                  {users
                    .filter(u => !selectedCourseData.enrollments?.some(e => e.userId === u.id))
                    .map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-surface rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enrollForm.userIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEnrollForm({ ...enrollForm, userIds: [...enrollForm.userIds, u.id] });
                            } else {
                              setEnrollForm({ ...enrollForm, userIds: enrollForm.userIds.filter(id => id !== u.id) });
                            }
                          }}
                          className="rounded border-border text-brand focus:ring-brand"
                        />
                        <span className="text-sm text-foreground">{u.name}</span>
                        <span className="text-xs text-muted">({u.role})</span>
                      </label>
                    ))
                  }
                  {users.filter(u => !selectedCourseData.enrollments?.some(e => e.userId === u.id)).length === 0 && (
                    <p className="text-sm text-muted italic p-2">All staff are already enrolled.</p>
                  )}
                </div>
                {enrollForm.userIds.length > 0 && (
                  <p className="text-xs text-muted mt-1">{enrollForm.userIds.length} selected</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={enrollForm.dueDate}
                  onChange={(e) => setEnrollForm({ ...enrollForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              {enrollStaff.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {(enrollStaff.error as Error).message}
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowEnroll(false)} className="flex-1 px-4 py-2.5 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={enrollStaff.isPending || enrollForm.userIds.length === 0} className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                  {enrollStaff.isPending ? "Enrolling..." : `Enrol ${enrollForm.userIds.length} Staff`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
