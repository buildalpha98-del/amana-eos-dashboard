"use client";

import { useState } from "react";
import { useUpdateService } from "@/hooks/useServices";
import {
  MapPin,
  Phone,
  Mail,
  Users,
  Calendar,
  Edit3,
} from "lucide-react";

import { ApprovalsSessionTimesCard } from "./ApprovalsSessionTimesCard";

export function ServiceInfoCard({
  service,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
}) {
  const updateService = useUpdateService();
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    code: "",
    address: "",
    suburb: "",
    state: "",
    postcode: "",
    phone: "",
    email: "",
    capacity: "",
    operatingDays: "",
  });

  return (
    <>
      {/* Contact Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            Contact Details
          </label>
          {!editingDetails && (
            <button
              onClick={() => {
                setDetailsForm({
                  name: service.name || "",
                  code: service.code || "",
                  address: service.address || "",
                  suburb: service.suburb || "",
                  state: service.state || "",
                  postcode: service.postcode || "",
                  phone: service.phone || "",
                  email: service.email || "",
                  capacity: service.capacity?.toString() || "",
                  operatingDays: service.operatingDays || "",
                });
                setEditingDetails(true);
              }}
              className="text-muted hover:text-brand"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingDetails ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Service Name</label>
                <input
                  autoFocus
                  type="text"
                  value={detailsForm.name}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service name"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Code</label>
                <input
                  type="text"
                  value={detailsForm.code}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service code"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Address</label>
              <input
                type="text"
                value={detailsForm.address}
                onChange={(e) => setDetailsForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Suburb</label>
                <input
                  type="text"
                  value={detailsForm.suburb}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, suburb: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Suburb"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">State</label>
                <input
                  type="text"
                  value={detailsForm.state}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, state: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="State"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Postcode</label>
                <input
                  type="text"
                  value={detailsForm.postcode}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, postcode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Postcode"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Phone</label>
                <input
                  type="text"
                  value={detailsForm.phone}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Email</label>
                <input
                  type="text"
                  value={detailsForm.email}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Email address"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Capacity</label>
                <input
                  type="number"
                  min={0}
                  value={detailsForm.capacity}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Max children"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Operating Days</label>
                <input
                  type="text"
                  value={detailsForm.operatingDays}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, operatingDays: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. Mon-Fri"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const capacityVal = detailsForm.capacity
                    ? parseInt(detailsForm.capacity, 10)
                    : null;
                  updateService.mutate({
                    id: service.id,
                    name: detailsForm.name,
                    code: detailsForm.code,
                    address: detailsForm.address,
                    suburb: detailsForm.suburb,
                    state: detailsForm.state,
                    postcode: detailsForm.postcode,
                    phone: detailsForm.phone,
                    email: detailsForm.email,
                    capacity: isNaN(capacityVal as number) ? null : capacityVal,
                    operatingDays: detailsForm.operatingDays,
                  });
                  setEditingDetails(false);
                }}
                className="text-xs px-3 py-1 bg-brand text-white rounded-md"
              >
                Save
              </button>
              <button
                onClick={() => setEditingDetails(false)}
                className="text-xs px-3 py-1 text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {service.name && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="font-medium">{service.name}</span>
                {service.code && (
                  <span className="text-xs text-muted">({service.code})</span>
                )}
              </div>
            )}
            {service.address && (
              <div className="flex items-start gap-2 text-sm text-muted">
                <MapPin className="w-4 h-4 text-muted mt-0.5" />
                <span>
                  {service.address}
                  {service.suburb && `, ${service.suburb}`}
                  {service.state && ` ${service.state}`}
                  {service.postcode && ` ${service.postcode}`}
                </span>
              </div>
            )}
            {service.phone && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Phone className="w-4 h-4 text-muted" />
                <a
                  href={`tel:${service.phone}`}
                  className="text-brand hover:underline"
                >
                  {service.phone}
                </a>
              </div>
            )}
            {service.email && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Mail className="w-4 h-4 text-muted" />
                <a
                  href={`mailto:${service.email}`}
                  className="text-brand hover:underline"
                >
                  {service.email}
                </a>
              </div>
            )}
            {service.capacity && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Users className="w-4 h-4 text-muted" />
                <span>Capacity: {service.capacity} children</span>
              </div>
            )}
            {service.operatingDays && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Calendar className="w-4 h-4 text-muted" />
                <span>{service.operatingDays}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Service Approvals & Session Times */}
      <ApprovalsSessionTimesCard service={service} canEdit={canEdit} />
    </>
  );
}
