"use client";

import { useState } from "react";
import { useServices } from "@/hooks/useServices";
import { ServiceCard } from "@/components/services/ServiceCard";
import { ServiceDetailPanel } from "@/components/services/ServiceDetailPanel";
import { CreateServiceModal } from "@/components/services/CreateServiceModal";
import { cn } from "@/lib/utils";
import {
  Building2,
  Plus,
  Search,
} from "lucide-react";

const statusTabs = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "onboarding", label: "Onboarding" },
  { key: "closing", label: "Closing" },
  { key: "closed", label: "Closed" },
];

export default function ServicesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: services, isLoading } = useServices(statusFilter || undefined);

  const filtered = services?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.suburb?.toLowerCase().includes(q) ||
      s.manager?.name.toLowerCase().includes(q)
    );
  });

  const counts = {
    all: services?.length || 0,
    active: services?.filter((s) => s.status === "active").length || 0,
    onboarding: services?.filter((s) => s.status === "onboarding").length || 0,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Service Centres
          </h2>
          <p className="text-gray-500 mt-1">
            Manage your OSHC centres across all locations
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Centre
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Centres</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{counts.all}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {counts.active}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Onboarding</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {counts.onboarding}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                statusFilter === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search centres..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onClick={() => setSelectedServiceId(service.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No service centres found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? "Try adjusting your search"
              : "Add your first OSHC centre to get started"}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Centre
            </button>
          )}
        </div>
      )}

      {/* Detail Panel */}
      {selectedServiceId && (
        <ServiceDetailPanel
          serviceId={selectedServiceId}
          onClose={() => setSelectedServiceId(null)}
        />
      )}

      {/* Create Modal */}
      <CreateServiceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
