"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  useOnboardingPacks,
  useOnboardingAssignments,
  useCreateOnboardingPack,
  useAssignOnboarding,
  useUpdateOnboardingProgress,
  type StaffOnboardingData,
} from "@/hooks/useOnboarding";
import {
  useLMSCourses,
  useLMSCourse,
  useCreateLMSCourse,
  useEnrollStaff,
  useUnenrollStaff,
  useUpdateModuleProgress,
  useSelfEnrol,
  useMyEnrollments,
} from "@/hooks/useLMS";
import { ModuleEditor } from "@/components/lms/ModuleEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  BookOpen,
  Plus,
  X,
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Building2,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  FileText,
  Video,
  HelpCircle,
  ExternalLink,
  ListChecks,
  Eye,
  EyeOff,
  Play,
  Trash2,
  UserPlus,
} from "lucide-react";
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

const STATUS_COLORS = {
  not_started: { bg: "bg-gray-100", text: "text-gray-600", label: "Not Started" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completed" },
};

const MODULE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  video: Video,
  quiz: HelpCircle,
  checklist: ListChecks,
  external_link: ExternalLink,
};

/* ------------------------------------------------------------------ */
/* Staff / Member LMS View                                             */
/* ------------------------------------------------------------------ */

function StaffLMSView() {
  const { data: myEnrollments = [], isLoading: enrollLoading } = useMyEnrollments();
  const { data: allCourses = [], isLoading: coursesLoading } = useLMSCourses("published");
  const selfEnrol = useSelfEnrol();
  const updateProgress = useUpdateModuleProgress();
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  const enrolledCourseIds = new Set(myEnrollments.map((e) => e.courseId));
  const availableCourses = allCourses.filter((c) => !enrolledCourseIds.has(c.id));

  const isLoading = enrollLoading || coursesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* My Courses */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#004E64]" />
          My Courses
          <span className="text-sm font-normal text-gray-400">({myEnrollments.length})</span>
        </h3>

        {myEnrollments.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">You haven&apos;t enrolled in any courses yet.</p>
            <p className="text-sm text-gray-400 mt-1">Browse available courses below to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myEnrollments.map((enrollment) => {
              const course = enrollment.course;
              const totalModules = course.modules?.length || 0;
              const completedModules = enrollment.moduleProgress?.filter((p) => p.completed).length || 0;
              const progress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
              const isExpanded = expandedCourseId === enrollment.id;

              return (
                <div key={enrollment.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedCourseId(isExpanded ? null : enrollment.id)}
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{course.title}</p>
                      <p className="text-sm text-gray-500 truncate">{course.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{progress}%</p>
                        <p className="text-xs text-gray-400">{completedModules}/{totalModules} modules</p>
                      </div>
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-[#004E64]" : "bg-gray-200"
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && course.modules && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {course.modules.map((mod) => {
                        const moduleProgress = enrollment.moduleProgress?.find((p) => p.moduleId === mod.id);
                        const isComplete = moduleProgress?.completed || false;
                        const isModExpanded = expandedModuleId === mod.id;
                        const ModIcon = MODULE_TYPE_ICONS[mod.type] || FileText;

                        return (
                          <div key={mod.id}>
                            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                              <button
                                onClick={() =>
                                  updateProgress.mutate({
                                    enrollmentId: enrollment.id,
                                    moduleId: mod.id,
                                    completed: !isComplete,
                                  })
                                }
                                className="flex-shrink-0"
                              >
                                {isComplete ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-300 hover:text-[#004E64]" />
                                )}
                              </button>
                              <ModIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <button
                                onClick={() => setExpandedModuleId(isModExpanded ? null : mod.id)}
                                className="flex-1 text-left"
                              >
                                <p className={cn("text-sm font-medium", isComplete ? "text-gray-400 line-through" : "text-gray-900")}>
                                  {mod.title}
                                </p>
                              </button>
                              {mod.content && (
                                <button
                                  onClick={() => setExpandedModuleId(isModExpanded ? null : mod.id)}
                                  className="text-xs text-[#004E64] hover:underline flex-shrink-0"
                                >
                                  {isModExpanded ? "Hide" : "View"}
                                </button>
                              )}
                            </div>
                            {isModExpanded && mod.content && (
                              <div className="px-12 pb-3">
                                <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">
                                  {mod.content}
                                </div>
                                {mod.resourceUrl && (
                                  <a href={mod.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#004E64] hover:underline mt-2">
                                    <ExternalLink className="w-3 h-3" /> Open resource
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Courses */}
      {availableCourses.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Available Courses
            <span className="text-sm font-normal text-gray-400">({availableCourses.length})</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableCourses.map((course) => (
              <div key={course.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 mb-1">{course.title}</p>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{course.description}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {course._count.modules} modules
                    </span>
                    {course.category && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-500">{course.category}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => selfEnrol.mutate(course.id)}
                  disabled={selfEnrol.isPending}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {selfEnrol.isPending ? "Enrolling..." : "Enrol"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasMinRole(role, "admin");
  const isOwner = role === "owner";
  const isStaff = role === "staff";
  const isServiceScoped = role === "staff" || role === "member";

  const [activeTab, setActiveTab] = useState<"onboarding" | "lms">("onboarding");
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
  const createCourse = useCreateLMSCourse();
  const assignPack = useAssignOnboarding();
  const updateProgress = useUpdateOnboardingProgress();
  const enrollStaff = useEnrollStaff();
  const unenrollStaff = useUnenrollStaff();
  const updateModuleProgress = useUpdateModuleProgress();

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
          <div className="w-12 h-12 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading onboarding & training...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Onboarding & Training</h2>
          <p className="text-gray-500 mt-1">
            {isStaff
              ? "Complete your onboarding tasks and training modules."
              : "Manage onboarding packs and LMS courses for staff."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {isOwner && (
              <button
                onClick={activeTab === "onboarding" ? handleSeedPacks : handleSeedCourses}
                disabled={seedingPacks || seedingCourses}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {(seedingPacks || seedingCourses) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {activeTab === "onboarding" ? "Seed Packs" : "Seed Training Courses"}
              </button>
            )}
            <button
              onClick={() => setShowAssign(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              Assign Pack
            </button>
            <button
              onClick={() => activeTab === "onboarding" ? setShowCreatePack(true) : setShowCreateCourse(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {activeTab === "onboarding" ? "Create Pack" : "Create Course"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("onboarding")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "onboarding" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <ClipboardList className="w-4 h-4" />
          Onboarding
        </button>
        <button
          onClick={() => setActiveTab("lms")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "lms" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <GraduationCap className="w-4 h-4" />
          Training / LMS
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
        <div className="space-y-6">
          {/* My Assignments (for staff) or All Assignments (for admin) */}
          {assignments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                {isStaff ? "My Onboarding" : "Active Assignments"}
              </h3>
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const status = STATUS_COLORS[assignment.status] || STATUS_COLORS.not_started;
                  const totalTasks = assignment.progress.length;
                  const completedTasks = assignment.progress.filter(p => p.completed).length;
                  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                  const isExpanded = expandedAssignment === assignment.id;

                  return (
                    <div key={assignment.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedAssignment(isExpanded ? null : assignment.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                            <ClipboardList className="w-5 h-5 text-[#004E64]" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{assignment.pack.name}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                              {!isStaff && <span>{assignment.user.name}</span>}
                              {assignment.pack.service && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {assignment.pack.service.name}
                                </span>
                              )}
                              {assignment.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Due {new Date(assignment.dueDate).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", status.bg, status.text)}>
                              {status.label}
                            </span>
                            <p className="text-xs text-gray-400 mt-1">{completedTasks}/{totalTasks} tasks</p>
                          </div>
                          <div className="w-20">
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#004E64] rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                          {assignment.progress.map((p) => (
                            <div key={p.id} className="flex items-center gap-3 py-1.5">
                              <button
                                onClick={() => handleToggleTask(assignment, p.taskId, p.completed)}
                                disabled={updateProgress.isPending}
                                className="flex-shrink-0"
                              >
                                {p.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-300 hover:text-[#004E64]" />
                                )}
                              </button>
                              <div className="flex-1">
                                <p className={cn("text-sm", p.completed ? "text-gray-400 line-through" : "text-gray-900")}>
                                  {p.task.title}
                                </p>
                                {p.task.category && (
                                  <span className="text-xs text-gray-400">{p.task.category}</span>
                                )}
                              </div>
                              {p.task.isRequired && (
                                <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Packs Library (admin view) */}
          {isAdmin && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Onboarding Packs</h3>
              {packs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No onboarding packs yet.</p>
                  <p className="text-gray-400 text-sm mt-1">Create your first pack to start onboarding new staff.</p>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {packs.map((pack) => (
                    <div key={pack.id} onClick={() => setSelectedPackId(selectedPackId === pack.id ? null : pack.id)} className={cn("bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer", selectedPackId === pack.id && "ring-2 ring-[#004E64] border-[#004E64]")}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                          <ClipboardList className="w-5 h-5 text-cyan-700" />
                        </div>
                        {pack.isDefault && (
                          <span className="text-[10px] font-bold uppercase bg-[#FECE00] text-[#004E64] px-2 py-0.5 rounded-full">Default</span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">{pack.name}</h4>
                      {pack.description && (
                        <p className="text-sm text-gray-500 line-clamp-2 mb-2">{pack.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
                        <span>{pack._count.tasks} tasks</span>
                        <span>{pack._count.assignments} assigned</span>
                        {pack.service && <span>{pack.service.name}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selected Pack Detail Panel */}
                {selectedPackId && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                          <ClipboardList className="w-5 h-5 text-cyan-700" />
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">
                            {selectedPackData?.name ?? packs.find(p => p.id === selectedPackId)?.name ?? "Pack Details"}
                          </h4>
                          {selectedPackData?.isDefault && (
                            <span className="text-[10px] font-bold uppercase bg-[#FECE00] text-[#004E64] px-2 py-0.5 rounded-full">Default</span>
                          )}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedPackId(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {selectedPackLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                        <span className="ml-2 text-sm text-gray-500">Loading pack details...</span>
                      </div>
                    ) : selectedPackData ? (
                      <div className="space-y-4">
                        {selectedPackData.description && (
                          <p className="text-sm text-gray-600">{selectedPackData.description}</p>
                        )}

                        <div>
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Tasks ({selectedPackData.tasks.length})</h5>
                          <div className="space-y-2">
                            {selectedPackData.tasks
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map((task) => (
                                <div key={task.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                                  <CheckCircle2 className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-900">{task.title}</p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                                      {task.category.replace("_", " ")}
                                    </span>
                                    {task.isRequired && (
                                      <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Could not load pack details.
                      </div>
                    )}
                  </div>
                )}
                </>
              )}
            </div>
          )}

          {/* Empty state for staff */}
          {isStaff && assignments.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-gray-500 text-lg">All caught up!</p>
              <p className="text-gray-400 text-sm mt-1">You have no onboarding tasks assigned.</p>
            </div>
          )}
        </div>
      )}

      {/* LMS Tab */}
      {activeTab === "lms" && isServiceScoped && (
        <StaffLMSView />
      )}

      {activeTab === "lms" && !isServiceScoped && (
        <div className="space-y-6">
          {courses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-lg">No training courses yet</p>
              <p className="text-gray-400 text-sm mt-1">
                {isAdmin ? "Create your first course to start training staff." : "No courses available at the moment."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <div key={course.id} onClick={() => { setSelectedCourseId(selectedCourseId === course.id ? null : course.id); setExpandedModuleId(null); setExpandedEnrollmentId(null); }} className={cn("bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer", selectedCourseId === course.id && "ring-2 ring-[#004E64] border-[#004E64]")}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-purple-700" />
                    </div>
                    <div className="flex items-center gap-2">
                      {course.isRequired && (
                        <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Required</span>
                      )}
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        course.status === "published" ? "bg-emerald-100 text-emerald-700"
                          : course.status === "draft" ? "bg-gray-100 text-gray-600"
                          : "bg-amber-100 text-amber-700"
                      )}>
                        {course.status}
                      </span>
                    </div>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1">{course.title}</h4>
                  {course.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-2">{course.description}</p>
                  )}
                  {course.category && (
                    <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mb-2">{course.category}</span>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
                    <span>{course._count.modules} modules</span>
                    <span>{course._count.enrollments} enrolled</span>
                    {course.service && <span>{course.service.name}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Course Detail Panel */}
          {selectedCourseId && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-purple-700" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">
                      {selectedCourseData?.title ?? courses.find(c => c.id === selectedCourseId)?.title ?? "Course Details"}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {selectedCourseData?.status && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                          selectedCourseData.status === "published" ? "bg-emerald-100 text-emerald-700"
                            : selectedCourseData.status === "draft" ? "bg-gray-100 text-gray-600"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {selectedCourseData.status}
                        </span>
                      )}
                      {selectedCourseData?.isRequired && (
                        <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Required</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && selectedCourseData && (
                    <button
                      onClick={() => { setEnrollForm({ userIds: [], dueDate: "" }); setShowEnroll(true); }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      Enrol Staff
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setSelectedCourseId(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {selectedCourseLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Loading course details...</span>
                </div>
              ) : selectedCourseData ? (
                <div className="space-y-6">
                  {selectedCourseData.description && (
                    <p className="text-sm text-gray-600">{selectedCourseData.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {selectedCourseData.category && (
                      <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{selectedCourseData.category}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {selectedCourseData.enrollments?.length ?? 0} enrolled
                    </span>
                  </div>

                  {isAdmin ? (
                    <>
                      {/* Module Editor */}
                      <ModuleEditor
                        courseId={selectedCourseData.id}
                        modules={selectedCourseData.modules ? [...selectedCourseData.modules].sort((a, b) => a.sortOrder - b.sortOrder) : []}
                      />

                      {/* Enrolled Staff Section */}
                      {selectedCourseData.enrollments && selectedCourseData.enrollments.length > 0 && (
                        <div>
                          <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Enrolled Staff ({selectedCourseData.enrollments.length})
                          </h5>
                          <div className="space-y-2">
                            {selectedCourseData.enrollments.map((enrollment) => {
                              const completedModules = enrollment.moduleProgress.filter(p => p.completed).length;
                              const totalModules = selectedCourseData.modules?.length ?? 0;
                              const pct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
                              const isExpandedEnrollment = expandedEnrollmentId === enrollment.id;

                              return (
                                <div key={enrollment.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                  <div
                                    onClick={() => setExpandedEnrollmentId(isExpandedEnrollment ? null : enrollment.id)}
                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900">{enrollment.user.name}</p>
                                      <p className="text-xs text-gray-500">{enrollment.user.email}</p>
                                    </div>
                                    <span className={cn(
                                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                      enrollment.status === "completed" ? "bg-emerald-100 text-emerald-700"
                                        : enrollment.status === "in_progress" ? "bg-blue-100 text-blue-700"
                                        : enrollment.status === "expired" ? "bg-red-100 text-red-700"
                                        : "bg-gray-100 text-gray-600"
                                    )}>
                                      {enrollment.status.replace("_", " ")}
                                    </span>
                                    <div className="w-24">
                                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                                        <span>{completedModules}/{totalModules}</span>
                                        <span>{pct}%</span>
                                      </div>
                                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#004E64] rounded-full transition-all" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                    {enrollment.dueDate && (
                                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                        <Clock className="w-3 h-3" />
                                        {new Date(enrollment.dueDate).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Unenrol ${enrollment.user.name} from this course?`)) {
                                          handleUnenroll(enrollment.id);
                                        }
                                      }}
                                      disabled={unenrollStaff.isPending}
                                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    {isExpandedEnrollment ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                  </div>

                                  {isExpandedEnrollment && (
                                    <div className="border-t border-gray-100 p-3 space-y-1.5 bg-gray-50/50">
                                      {selectedCourseData.modules
                                        ?.slice()
                                        .sort((a, b) => a.sortOrder - b.sortOrder)
                                        .map((mod) => {
                                          const modProgress = enrollment.moduleProgress.find(p => p.moduleId === mod.id);
                                          return (
                                            <div key={mod.id} className="flex items-center gap-2 text-xs">
                                              {modProgress?.completed ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                              ) : (
                                                <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                              )}
                                              <span className={cn("flex-1", modProgress?.completed ? "text-gray-400 line-through" : "text-gray-700")}>
                                                {mod.title}
                                              </span>
                                              {modProgress?.completedAt && (
                                                <span className="text-gray-400">
                                                  {new Date(modProgress.completedAt).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedCourseData.enrollments && selectedCourseData.enrollments.length === 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No staff enrolled yet.</p>
                          <button
                            onClick={() => { setEnrollForm({ userIds: [], dueDate: "" }); setShowEnroll(true); }}
                            className="text-sm text-[#004E64] hover:underline mt-1"
                          >
                            Enrol staff now →
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    /* ─── Staff Content Viewer ─── */
                    <StaffCourseViewer
                      course={selectedCourseData}
                      userId={session?.user?.id}
                      expandedModuleId={expandedModuleId}
                      setExpandedModuleId={setExpandedModuleId}
                      revealedAnswers={revealedAnswers}
                      setRevealedAnswers={setRevealedAnswers}
                      onModuleProgress={handleModuleProgress}
                      isUpdating={updateModuleProgress.isPending}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Could not load course details.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Pack Modal */}
      {showCreatePack && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Create Onboarding Pack</h3>
              <button onClick={() => setShowCreatePack(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreatePack} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={packForm.name} onChange={(e) => setPackForm({ ...packForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" placeholder="E.g., New Staff Induction Pack" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={packForm.description} onChange={(e) => setPackForm({ ...packForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Centre (Optional)</label>
                  <select value={packForm.serviceId} onChange={(e) => setPackForm({ ...packForm, serviceId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]">
                    <option value="">Company-wide</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={packForm.isDefault} onChange={(e) => setPackForm({ ...packForm, isDefault: e.target.checked })} className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]" />
                    Default pack for new staff
                  </label>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Tasks</label>
                  <button type="button" onClick={() => setPackForm({ ...packForm, tasks: [...packForm.tasks, { title: "", description: "", category: "general", isRequired: true }] })} className="text-xs text-[#004E64] hover:underline flex items-center gap-1">
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                        placeholder={`Task ${i + 1}...`}
                      />
                      <select
                        value={task.category}
                        onChange={(e) => {
                          const tasks = [...packForm.tasks];
                          tasks[i] = { ...tasks[i], category: e.target.value };
                          setPackForm({ ...packForm, tasks });
                        }}
                        className="px-2 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                      >
                        <option value="general">General</option>
                        <option value="documentation">Documentation</option>
                        <option value="training">Training</option>
                        <option value="compliance">Compliance</option>
                        <option value="it_setup">IT Setup</option>
                      </select>
                      {packForm.tasks.length > 1 && (
                        <button type="button" onClick={() => setPackForm({ ...packForm, tasks: packForm.tasks.filter((_, j) => j !== i) })} className="p-1 text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowCreatePack(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createPack.isPending} className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Create Training Course</h3>
              <button onClick={() => setShowCreateCourse(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" placeholder="E.g., Workplace Health & Safety" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input type="text" value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" placeholder="E.g., Safety, Compliance" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Centre (Optional)</label>
                  <select value={courseForm.serviceId} onChange={(e) => setCourseForm({ ...courseForm, serviceId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]">
                    <option value="">Company-wide</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={courseForm.isRequired} onChange={(e) => setCourseForm({ ...courseForm, isRequired: e.target.checked })} className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]" />
                Required course for all staff
              </label>
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowCreateCourse(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createCourse.isPending} className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Assign Onboarding Pack</h3>
              <button onClick={() => setShowAssign(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
                <select value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" required>
                  <option value="">Select user...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding Pack *</label>
                <select value={assignForm.packId} onChange={(e) => setAssignForm({ ...assignForm, packId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" required>
                  <option value="">Select pack...</option>
                  {packs.map(p => <option key={p.id} value={p.id}>{p.name} ({p._count.tasks} tasks)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
                <input type="date" value={assignForm.dueDate} onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]" />
              </div>
              {assignPack.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {(assignPack.error as Error).message}
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowAssign(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={assignPack.isPending} className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Enrol Staff</h3>
                <p className="text-sm text-gray-500 mt-0.5">{selectedCourseData.title}</p>
              </div>
              <button onClick={() => setShowEnroll(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEnroll} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Staff Members *</label>
                <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
                  {users
                    .filter(u => !selectedCourseData.enrollments?.some(e => e.userId === u.id))
                    .map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
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
                          className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
                        />
                        <span className="text-sm text-gray-900">{u.name}</span>
                        <span className="text-xs text-gray-400">({u.role})</span>
                      </label>
                    ))
                  }
                  {users.filter(u => !selectedCourseData.enrollments?.some(e => e.userId === u.id)).length === 0 && (
                    <p className="text-sm text-gray-400 italic p-2">All staff are already enrolled.</p>
                  )}
                </div>
                {enrollForm.userIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{enrollForm.userIds.length} selected</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={enrollForm.dueDate}
                  onChange={(e) => setEnrollForm({ ...enrollForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004E64]"
                />
              </div>
              {enrollStaff.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {(enrollStaff.error as Error).message}
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={() => setShowEnroll(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={enrollStaff.isPending || enrollForm.userIds.length === 0} className="flex-1 bg-[#004E64] hover:bg-[#003D52] text-white font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
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

/* ───────────────────────────────────────────────────────────
   Staff Course Viewer — Interactive module content + progress
   ─────────────────────────────────────────────────────────── */
interface StaffCourseViewerProps {
  course: {
    id: string;
    modules: {
      id: string;
      title: string;
      description: string | null;
      type: "document" | "video" | "quiz" | "checklist" | "external_link";
      content: string | null;
      resourceUrl: string | null;
      duration: number | null;
      sortOrder: number;
      isRequired: boolean;
    }[];
    enrollments: {
      id: string;
      userId: string;
      status: string;
      moduleProgress: { id: string; moduleId: string; completed: boolean; completedAt: string | null }[];
    }[];
  };
  userId: string | undefined;
  expandedModuleId: string | null;
  setExpandedModuleId: (id: string | null) => void;
  revealedAnswers: Set<string>;
  setRevealedAnswers: React.Dispatch<React.SetStateAction<Set<string>>>;
  onModuleProgress: (enrollmentId: string, moduleId: string, completed: boolean) => void;
  isUpdating: boolean;
}

function StaffCourseViewer({
  course,
  userId,
  expandedModuleId,
  setExpandedModuleId,
  revealedAnswers,
  setRevealedAnswers,
  onModuleProgress,
  isUpdating,
}: StaffCourseViewerProps) {
  const myEnrollment = course.enrollments?.find((e) => e.userId === userId);
  const modules = [...course.modules].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedCount = myEnrollment
    ? myEnrollment.moduleProgress.filter((p) => p.completed).length
    : 0;
  const totalModules = modules.length;
  const pct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {myEnrollment && (
        <div className="bg-gradient-to-r from-[#004E64]/5 to-transparent rounded-lg p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Your Progress</span>
            <span className="text-gray-500">
              {completedCount}/{totalModules} modules
              {pct === 100 && " ✓ Complete!"}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                pct === 100 ? "bg-emerald-500" : "bg-[#004E64]"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {myEnrollment.status === "completed" && (
            <p className="text-xs text-emerald-600 mt-2 font-medium">🎉 Course completed! Well done.</p>
          )}
        </div>
      )}

      {!myEnrollment && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          You are not enrolled in this course. Content is view-only. Ask your admin to enrol you.
        </div>
      )}

      {/* Module accordion */}
      {modules.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No modules in this course yet.</p>
      ) : (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-gray-900">
            Modules ({modules.length})
          </h5>
          {modules.map((mod) => {
            const TypeIcon = MODULE_TYPE_ICONS[mod.type] || FileText;
            const isExpanded = expandedModuleId === mod.id;
            const progress = myEnrollment?.moduleProgress.find((p) => p.moduleId === mod.id);
            const isCompleted = progress?.completed ?? false;

            return (
              <div key={mod.id} className={cn("border rounded-lg overflow-hidden transition-colors", isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200")}>
                {/* Module header */}
                <button
                  onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50/50 transition-colors text-left"
                >
                  {myEnrollment && (
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                  )}
                  <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", isCompleted ? "text-gray-400 line-through" : "text-gray-900")}>
                      {mod.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                      {mod.type.replace("_", " ")}
                    </span>
                    {mod.duration && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {mod.duration}m
                      </span>
                    )}
                    {mod.isRequired && (
                      <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                    )}
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-white">
                    {mod.description && (
                      <p className="text-sm text-gray-600 mb-3 italic">{mod.description}</p>
                    )}

                    {/* Document content */}
                    {mod.type === "document" && mod.content && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                        {mod.content}
                      </div>
                    )}

                    {/* Checklist content */}
                    {mod.type === "checklist" && mod.content && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2">
                        {mod.content.split("\n").filter(line => line.trim()).map((line, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-sm text-gray-800">
                            <div className="w-4 h-4 mt-0.5 rounded border border-gray-300 flex-shrink-0 flex items-center justify-center">
                              <span className="text-[10px] text-gray-400">{i + 1}</span>
                            </div>
                            <span>{line.replace(/^[☐☑✓✔•\-\*]\s*/, "").trim()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quiz content */}
                    {mod.type === "quiz" && mod.content && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-4">
                        {mod.content.split(/\n(?=Q\d|Question)/i).filter(q => q.trim()).map((qa, i) => {
                          const lines = qa.split("\n").filter(l => l.trim());
                          const question = lines[0];
                          const answer = lines.slice(1).join("\n");
                          const key = `${mod.id}-${i}`;
                          const isRevealed = revealedAnswers.has(key);

                          return (
                            <div key={i} className="space-y-1.5">
                              <p className="text-sm font-medium text-gray-900">{question}</p>
                              {answer && (
                                <div>
                                  <button
                                    onClick={() => {
                                      setRevealedAnswers(prev => {
                                        const next = new Set(prev);
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    }}
                                    className="text-xs text-[#004E64] hover:underline flex items-center gap-1"
                                  >
                                    {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    {isRevealed ? "Hide Answer" : "Show Answer"}
                                  </button>
                                  {isRevealed && (
                                    <p className="text-sm text-gray-600 mt-1.5 pl-3 border-l-2 border-[#004E64]/20 whitespace-pre-wrap">
                                      {answer}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Video content */}
                    {mod.type === "video" && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        {mod.resourceUrl ? (
                          <a href={mod.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] transition-colors text-sm">
                            <Play className="w-4 h-4" /> Watch Video
                          </a>
                        ) : mod.content ? (
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{mod.content}</p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No video link provided yet.</p>
                        )}
                      </div>
                    )}

                    {/* External link content */}
                    {mod.type === "external_link" && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        {mod.resourceUrl ? (
                          <a href={mod.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] transition-colors text-sm">
                            <ExternalLink className="w-4 h-4" /> Open Resource
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No link provided yet.</p>
                        )}
                      </div>
                    )}

                    {/* Fallback no content */}
                    {!mod.content && !mod.resourceUrl && mod.type !== "video" && mod.type !== "external_link" && (
                      <p className="text-sm text-gray-400 italic">No content available for this module yet.</p>
                    )}

                    {/* Mark as Complete button */}
                    {myEnrollment && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <button
                          onClick={() => onModuleProgress(myEnrollment.id, mod.id, !isCompleted)}
                          disabled={isUpdating}
                          className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                            isCompleted
                              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          )}
                        >
                          {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isCompleted ? (
                            <Circle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
