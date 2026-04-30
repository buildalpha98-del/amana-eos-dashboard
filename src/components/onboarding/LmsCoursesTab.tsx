"use client";

import { useState } from "react";
import {
  useLMSCourses,
  useMyEnrollments,
  useSelfEnrol,
  useUpdateModuleProgress,
  type LMSCourseData,
  type LMSModuleData,
  type LMSModuleProgressData,
  type useUnenrollStaff,
} from "@/hooks/useLMS";
import { ModuleEditor } from "@/components/lms/ModuleEditor";
import { StaffModuleRow } from "@/components/lms/StaffModuleRow";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  GraduationCap,
  BookOpen,
  X,
  CheckCircle2,
  Circle,
  Clock,
  Users,
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
        <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* My Courses */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand" />
          My Courses
          <span className="text-sm font-normal text-muted">({myEnrollments.length})</span>
        </h3>

        {myEnrollments.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-6 text-center">
            <GraduationCap className="w-10 h-10 text-muted/50 mx-auto mb-2" />
            <p className="text-muted">You haven&apos;t enrolled in any courses yet.</p>
            <p className="text-sm text-muted mt-1">Browse available courses below to get started.</p>
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
                <div key={enrollment.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedCourseId(isExpanded ? null : enrollment.id)}
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{course.title}</p>
                      <p className="text-sm text-muted truncate">{course.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{progress}%</p>
                        <p className="text-xs text-muted">{completedModules}/{totalModules} modules</p>
                      </div>
                      <div className="w-16 h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-brand" : "bg-border"
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                    </div>
                  </button>

                  {isExpanded && course.modules && (
                    <div className="border-t border-border/50 divide-y divide-gray-50">
                      {course.modules.map((mod) => {
                        const moduleProgress = enrollment.moduleProgress?.find((p) => p.moduleId === mod.id);
                        const isComplete = moduleProgress?.completed || false;
                        const isModExpanded = expandedModuleId === mod.id;

                        return (
                          <StaffModuleRow
                            key={mod.id}
                            mod={mod}
                            isComplete={isComplete}
                            isExpanded={isModExpanded}
                            onToggleComplete={() =>
                              updateProgress.mutate({
                                enrollmentId: enrollment.id,
                                moduleId: mod.id,
                                completed: !isComplete,
                              })
                            }
                            onToggleExpand={() =>
                              setExpandedModuleId(isModExpanded ? null : mod.id)
                            }
                          />
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
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Available Courses
            <span className="text-sm font-normal text-muted">({availableCourses.length})</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableCourses.map((course) => (
              <div key={course.id} className="bg-card rounded-xl border border-border p-5 flex flex-col">
                <div className="flex-1">
                  <p className="font-semibold text-foreground mb-1">{course.title}</p>
                  <p className="text-sm text-muted line-clamp-2 mb-3">{course.description}</p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {course._count.modules} modules
                    </span>
                    {course.category && (
                      <span className="px-2 py-0.5 bg-surface rounded-full text-muted">{course.category}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => selfEnrol.mutate(course.id)}
                  disabled={selfEnrol.isPending}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
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

/* ───────────────────────────────────────────────────────────
   Staff Course Viewer — Interactive module content + progress
   ─────────────────────────────────────────────────────────── */
interface StaffCourseViewerProps {
  course: {
    id: string;
    modules: LMSModuleData[];
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
        <div className="bg-gradient-to-r from-brand/5 to-transparent rounded-lg p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-foreground/80">Your Progress</span>
            <span className="text-muted">
              {completedCount}/{totalModules} modules
              {pct === 100 && " ✓ Complete!"}
            </span>
          </div>
          <div className="h-3 bg-border rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                pct === 100 ? "bg-emerald-500" : "bg-brand"
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
        <p className="text-sm text-muted italic">No modules in this course yet.</p>
      ) : (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-foreground">
            Modules ({modules.length})
          </h5>
          {modules.map((mod) => {
            const TypeIcon = MODULE_TYPE_ICONS[mod.type] || FileText;
            const isExpanded = expandedModuleId === mod.id;
            const progress = myEnrollment?.moduleProgress.find((p) => p.moduleId === mod.id);
            const isCompleted = progress?.completed ?? false;

            return (
              <div key={mod.id} className={cn("border rounded-lg overflow-hidden transition-colors", isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-border")}>
                {/* Module header */}
                <button
                  onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-surface/50 transition-colors text-left"
                >
                  {myEnrollment && (
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted/50" />
                      )}
                    </div>
                  )}
                  <TypeIcon className="w-4 h-4 text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", isCompleted ? "text-muted line-through" : "text-foreground")}>
                      {mod.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-medium bg-border text-muted px-2 py-0.5 rounded-full capitalize">
                      {mod.type.replace("_", " ")}
                    </span>
                    {mod.duration && (
                      <span className="text-[10px] text-muted flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {mod.duration}m
                      </span>
                    )}
                    {mod.isRequired && (
                      <span className="text-[10px] font-medium text-red-500 uppercase">Required</span>
                    )}
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border/50 p-4 bg-card">
                    {mod.description && (
                      <p className="text-sm text-muted mb-3 italic">{mod.description}</p>
                    )}

                    {/* Document content */}
                    {mod.type === "document" && mod.content && (
                      <div className="bg-surface/50 rounded-lg p-4 border border-border text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                        {mod.content}
                      </div>
                    )}

                    {/* Checklist content */}
                    {mod.type === "checklist" && mod.content && (
                      <div className="bg-surface/50 rounded-lg p-4 border border-border space-y-2">
                        {mod.content.split("\n").filter(line => line.trim()).map((line, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                            <div className="w-4 h-4 mt-0.5 rounded border border-border flex-shrink-0 flex items-center justify-center">
                              <span className="text-[10px] text-muted">{i + 1}</span>
                            </div>
                            <span>{line.replace(/^[☐☑✓✔•\-\*]\s*/, "").trim()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quiz content */}
                    {mod.type === "quiz" && mod.content && (
                      <div className="bg-surface/50 rounded-lg p-4 border border-border space-y-4">
                        {mod.content.split(/\n(?=Q\d|Question)/i).filter(q => q.trim()).map((qa, i) => {
                          const lines = qa.split("\n").filter(l => l.trim());
                          const question = lines[0];
                          const answer = lines.slice(1).join("\n");
                          const key = `${mod.id}-${i}`;
                          const isRevealed = revealedAnswers.has(key);

                          return (
                            <div key={i} className="space-y-1.5">
                              <p className="text-sm font-medium text-foreground">{question}</p>
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
                                    className="text-xs text-brand hover:underline flex items-center gap-1"
                                  >
                                    {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    {isRevealed ? "Hide Answer" : "Show Answer"}
                                  </button>
                                  {isRevealed && (
                                    <p className="text-sm text-muted mt-1.5 pl-3 border-l-2 border-brand/20 whitespace-pre-wrap">
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
                      <div className="bg-surface/50 rounded-lg p-4 border border-border">
                        {mod.resourceUrl ? (
                          <a href={mod.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors text-sm">
                            <Play className="w-4 h-4" /> Watch Video
                          </a>
                        ) : mod.content ? (
                          <p className="text-sm text-muted whitespace-pre-wrap">{mod.content}</p>
                        ) : (
                          <p className="text-sm text-muted italic">No video link provided yet.</p>
                        )}
                      </div>
                    )}

                    {/* External link content */}
                    {mod.type === "external_link" && (
                      <div className="bg-surface/50 rounded-lg p-4 border border-border">
                        {mod.resourceUrl ? (
                          <a href={mod.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors text-sm">
                            <ExternalLink className="w-4 h-4" /> Open Resource
                          </a>
                        ) : (
                          <p className="text-sm text-muted italic">No link provided yet.</p>
                        )}
                      </div>
                    )}

                    {/* Fallback no content */}
                    {!mod.content && !mod.resourceUrl && mod.type !== "video" && mod.type !== "external_link" && (
                      <p className="text-sm text-muted italic">No content available for this module yet.</p>
                    )}

                    {/* Mark as Complete button */}
                    {myEnrollment && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <button
                          onClick={() => onModuleProgress(myEnrollment.id, mod.id, !isCompleted)}
                          disabled={isUpdating}
                          className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                            isCompleted
                              ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
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

/* ------------------------------------------------------------------ */
/* LMS Courses Tab (main export)                                       */
/* ------------------------------------------------------------------ */

type CourseSummary = LMSCourseData;

interface SelectedCourseData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  isRequired: boolean;
  status: string;
  modules?: LMSModuleData[];
  enrollments?: {
    id: string;
    userId: string;
    status: string;
    dueDate?: string | null;
    user: { id: string; name: string; email: string };
    moduleProgress: LMSModuleProgressData[];
  }[];
}

type UnenrollMutation = ReturnType<typeof useUnenrollStaff>;
type UpdateModuleProgressMutation = ReturnType<typeof useUpdateModuleProgress>;

export interface LmsCoursesTabProps {
  isServiceScoped: boolean;
  isAdmin: boolean;
  courses: CourseSummary[];
  selectedCourseId: string | null;
  setSelectedCourseId: (id: string | null) => void;
  expandedModuleId: string | null;
  setExpandedModuleId: (id: string | null) => void;
  expandedEnrollmentId: string | null;
  setExpandedEnrollmentId: (id: string | null) => void;
  selectedCourseData: SelectedCourseData | undefined;
  selectedCourseLoading: boolean;
  setEnrollForm: (form: { userIds: string[]; dueDate: string }) => void;
  setShowEnroll: (show: boolean) => void;
  revealedAnswers: Set<string>;
  setRevealedAnswers: React.Dispatch<React.SetStateAction<Set<string>>>;
  userId: string | undefined;
  unenrollStaff: UnenrollMutation;
  updateModuleProgress: UpdateModuleProgressMutation;
  handleUnenroll: (enrollmentId: string) => Promise<void> | void;
  handleModuleProgress: (enrollmentId: string, moduleId: string, completed: boolean) => Promise<void> | void;
}

export function LmsCoursesTab({
  isServiceScoped,
  isAdmin,
  courses,
  selectedCourseId,
  setSelectedCourseId,
  expandedModuleId,
  setExpandedModuleId,
  expandedEnrollmentId,
  setExpandedEnrollmentId,
  selectedCourseData,
  selectedCourseLoading,
  setEnrollForm,
  setShowEnroll,
  revealedAnswers,
  setRevealedAnswers,
  userId,
  unenrollStaff,
  updateModuleProgress,
  handleUnenroll,
  handleModuleProgress,
}: LmsCoursesTabProps) {
  if (isServiceScoped) {
    return <StaffLMSView />;
  }

  return (
    <div className="space-y-6">
      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No training courses yet"
          description={isAdmin ? "Create your first course to start training staff." : "No courses available at the moment."}
          variant="inline"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div key={course.id} onClick={() => { setSelectedCourseId(selectedCourseId === course.id ? null : course.id); setExpandedModuleId(null); setExpandedEnrollmentId(null); }} className={cn("bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer", selectedCourseId === course.id && "ring-2 ring-brand border-brand")}>
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
                      : course.status === "draft" ? "bg-gray-100 text-gray-500"
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {course.status}
                  </span>
                </div>
              </div>
              <h4 className="font-semibold text-foreground mb-1">{course.title}</h4>
              {course.description && (
                <p className="text-sm text-muted line-clamp-2 mb-2">{course.description}</p>
              )}
              {course.category && (
                <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mb-2">{course.category}</span>
              )}
              <div className="flex items-center gap-4 text-xs text-muted mt-3">
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
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-foreground">
                  {selectedCourseData?.title ?? courses.find(c => c.id === selectedCourseId)?.title ?? "Course Details"}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedCourseData?.status && (
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                      selectedCourseData.status === "published" ? "bg-emerald-100 text-emerald-700"
                        : selectedCourseData.status === "draft" ? "bg-gray-100 text-gray-500"
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
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Enrol Staff
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setSelectedCourseId(null); }} className="p-1.5 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {selectedCourseLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-muted animate-spin" />
              <span className="ml-2 text-sm text-muted">Loading course details...</span>
            </div>
          ) : selectedCourseData ? (
            <div className="space-y-6">
              {selectedCourseData.description && (
                <p className="text-sm text-muted">{selectedCourseData.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-muted">
                {selectedCourseData.category && (
                  <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{selectedCourseData.category}</span>
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
                      <h5 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
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
                            <div key={enrollment.id} className="border border-border rounded-lg overflow-hidden">
                              <div
                                onClick={() => setExpandedEnrollmentId(isExpandedEnrollment ? null : enrollment.id)}
                                className="flex items-center gap-3 p-3 hover:bg-surface cursor-pointer"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground">{enrollment.user.name}</p>
                                  <p className="text-xs text-muted">{enrollment.user.email}</p>
                                </div>
                                <span className={cn(
                                  "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                  enrollment.status === "completed" ? "bg-emerald-100 text-emerald-700"
                                    : enrollment.status === "in_progress" ? "bg-blue-100 text-blue-700"
                                    : enrollment.status === "expired" ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-500"
                                )}>
                                  {enrollment.status.replace("_", " ")}
                                </span>
                                <div className="w-24">
                                  <div className="flex items-center justify-between text-[10px] text-muted mb-0.5">
                                    <span>{completedModules}/{totalModules}</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                    <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                {enrollment.dueDate && (
                                  <span className="text-[10px] text-muted flex items-center gap-0.5">
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
                                  className="p-1 text-muted hover:text-danger transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {isExpandedEnrollment ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                              </div>

                              {isExpandedEnrollment && (
                                <div className="border-t border-border/50 p-3 space-y-1.5 bg-surface/30">
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
                                            <Circle className="w-3.5 h-3.5 text-muted/50 flex-shrink-0" />
                                          )}
                                          <span className={cn("flex-1", modProgress?.completed ? "text-muted line-through" : "text-foreground/80")}>
                                            {mod.title}
                                          </span>
                                          {modProgress?.completedAt && (
                                            <span className="text-muted">
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
                    <div className="bg-surface/50 rounded-lg p-4 text-center">
                      <Users className="w-8 h-8 text-muted/50 mx-auto mb-2" />
                      <p className="text-sm text-muted">No staff enrolled yet.</p>
                      <button
                        onClick={() => { setEnrollForm({ userIds: [], dueDate: "" }); setShowEnroll(true); }}
                        className="text-sm text-brand hover:underline mt-1"
                      >
                        Enrol staff now →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* ─── Staff Content Viewer ─── */
                <StaffCourseViewer
                  course={{
                    id: selectedCourseData.id,
                    modules: selectedCourseData.modules ?? [],
                    enrollments: (selectedCourseData.enrollments ?? []).map((e) => ({
                      id: e.id,
                      userId: e.userId,
                      status: e.status,
                      moduleProgress: e.moduleProgress,
                    })),
                  }}
                  userId={userId}
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
            <div className="flex items-center justify-center py-8 text-sm text-muted">
              <AlertCircle className="w-4 h-4 mr-2" />
              Could not load course details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
