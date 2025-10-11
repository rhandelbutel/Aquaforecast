// components/admin/admin-user-management.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  approveUser,
  rejectUser,
  blockUser,
  unblockUser,
  type UserProfile,
} from "@/lib/user-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
  RefreshCw,
  Calendar,
  Mail,
  ShieldBan,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, QueryDocumentSnapshot, Timestamp } from "firebase/firestore";

// ---------- Types ----------
type AdminUser = Omit<
  UserProfile,
  | "createdAt"
  | "approvedAt"
  | "rejectedAt"
  | "blockedAt"
  | "approvedBy"
  | "rejectedBy"
  | "blockedBy"
  | "studentId"
> & {
  createdAt?: Date;        // allow undefined (matches Firestore reads)
  approvedAt?: Date;
  rejectedAt?: Date;
  blockedAt?: Date;
  approvedBy?: string | null;
  rejectedBy?: string | null;
  blockedBy?: string | null;
  studentId?: string | null;
};

type UserStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  blocked: number;
};

// ---------- Helpers ----------
const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  return v instanceof Date ? v : (v as Timestamp)?.toDate?.() ?? undefined;
};

const fromDoc = (doc: QueryDocumentSnapshot): AdminUser => {
  const d = doc.data() as any;
  return {
    uid: doc.id,
    email: d.email,
    displayName: d.displayName,
    role: d.role,
    status: d.status, // "pending" | "approved" | "rejected" | "blocked"
    createdAt: toDate(d.createdAt),
    approvedAt: toDate(d.approvedAt),
    approvedBy: d.approvedBy ?? null,
    rejectedAt: toDate(d.rejectedAt),
    rejectedBy: d.rejectedBy ?? null,
    blockedAt: toDate(d.blockedAt),
    blockedBy: d.blockedBy ?? null,
    studentId: d.studentId ?? d.studentID ?? d.sid ?? null,
    fullName: d.fullName,
    phone: d.phone,
    blockReason: d.blockReason ?? null,
  };
};

const formatDate = (date?: Date) => {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ---------- Component ----------
export function AdminUserManagement() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [stats, setStats] = useState<UserStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    blocked: 0,
  });

  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<AdminUser[]>([]);
  const [rejectedUsers, setRejectedUsers] = useState<AdminUser[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    action: "approve" | "reject" | "block" | "unblock";
    user: AdminUser | null;
  }>({ show: false, action: "approve", user: null });

  // Real-time subscription
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsub = onSnapshot(
      usersRef,
      (snap) => {
        const all = snap.docs.map(fromDoc);

        const pending = all.filter((u) => u.status === "pending");
        const approved = all.filter((u) => u.status === "approved");
        const rejected = all.filter((u) => u.status === "rejected");
        const blocked = all.filter((u) => u.status === "blocked");

        setAllUsers(all);
        setPendingUsers(pending);
        setApprovedUsers(approved);
        setRejectedUsers(rejected);
        setBlockedUsers(blocked);

        setStats({
          total: all.length,
          pending: pending.length,
          approved: approved.length,
          rejected: rejected.length,
          blocked: blocked.length,
        });

        setLoading(false);
      },
      (err) => {
        console.error("users onSnapshot error:", err);
        toast({
          title: "Error",
          description: "Failed to subscribe to user changes.",
          variant: "destructive",
        });
        setLoading(false);
      }
    );

    return () => unsub();
  }, [toast]);

  // Actions
  const handleApprove = async (userProfile: AdminUser) => {
    if (!user?.email) return;
    setActionLoading(userProfile.uid);
    try {
      await approveUser(userProfile.uid, user.email);
      toast({ title: "User Approved", description: `${userProfile.email} has been approved.` });
    } catch (error) {
      console.error("Error approving user:", error);
      toast({ title: "Error", description: "Failed to approve user", variant: "destructive" });
    } finally {
      setActionLoading(null);
      setShowConfirmModal({ show: false, action: "approve", user: null });
    }
  };

  const handleReject = async (userProfile: AdminUser) => {
    if (!user?.email) return;
    setActionLoading(userProfile.uid);
    try {
      await rejectUser(userProfile.uid, user.email);
      toast({ title: "User Rejected", description: `${userProfile.email} has been rejected.` });
    } catch (error) {
      console.error("Error rejecting user:", error);
      toast({ title: "Error", description: "Failed to reject user", variant: "destructive" });
    } finally {
      setActionLoading(null);
      setShowConfirmModal({ show: false, action: "reject", user: null });
    }
  };

  const handleBlock = async (userProfile: AdminUser) => {
    if (!user?.email) return;
    setActionLoading(userProfile.uid);
    try {
      await blockUser(userProfile.uid, user.email, "Policy violation");
      toast({ title: "User Blocked", description: `${userProfile.email} has been blocked.` });
    } catch (error) {
      console.error("Error blocking user:", error);
      toast({ title: "Error", description: "Failed to block user", variant: "destructive" });
    } finally {
      setActionLoading(null);
      setShowConfirmModal({ show: false, action: "block", user: null });
    }
  };

  const handleUnblock = async (userProfile: AdminUser) => {
    if (!user?.email) return;
    setActionLoading(userProfile.uid);
    try {
      await unblockUser(userProfile.uid, user.email);
      toast({ title: "User Unblocked", description: `${userProfile.email} has been unblocked.` });
    } catch (error) {
      console.error("Error unblocking user:", error);
      toast({ title: "Error", description: "Failed to unblock user", variant: "destructive" });
    } finally {
      setActionLoading(null);
      setShowConfirmModal({ show: false, action: "unblock", user: null });
    }
  };

  const confirmAction = () => {
    if (!showConfirmModal.user) return;
    const u = showConfirmModal.user;
    if (showConfirmModal.action === "approve") return handleApprove(u);
    if (showConfirmModal.action === "reject") return handleReject(u);
    if (showConfirmModal.action === "block") return handleBlock(u);
    if (showConfirmModal.action === "unblock") return handleUnblock(u);
  };

  const UserCard = ({
    userProfile,
    showActions = true,
  }: {
    userProfile: AdminUser;
    showActions?: boolean;
  }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <span className="font-medium text-gray-900 text-sm sm:text-base break-words break-all">
                {userProfile.email}
              </span>
              <Badge
                variant={
                  userProfile.status === "approved"
                    ? "default"
                    : userProfile.status === "rejected"
                    ? "destructive"
                    : userProfile.status === "blocked"
                    ? "outline"
                    : "secondary"
                }
                className="text-[10px] sm:text-xs px-1.5 py-0.5"
              >
                {userProfile.status}
              </Badge>
            </div>

            {/* Student ID */}
            <div className="text-xs sm:text-sm text-gray-700 mb-2">
              <span className="font-medium">Student ID:</span>{" "}
              {userProfile.studentId && String(userProfile.studentId).trim() !== ""
                ? userProfile.studentId
                : "—"}
            </div>

            <div className="text-xs sm:text-sm text-gray-600 space-y-1 break-words">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>Created: {formatDate(userProfile.createdAt)}</span>
              </div>
              {userProfile.approvedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  <span className="break-words">
                    Approved: {formatDate(userProfile.approvedAt)} by {userProfile.approvedBy}
                  </span>
                </div>
              )}
              {userProfile.rejectedAt && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-3 w-3 text-red-600" />
                  <span className="break-words">
                    Rejected: {formatDate(userProfile.rejectedAt)} by {userProfile.rejectedBy}
                  </span>
                </div>
              )}
              {userProfile.blockedAt && (
                <div className="flex items-center gap-2">
                  <ShieldBan className="h-3 w-3 text-red-600" />
                  <span className="break-words">
                    Blocked: {formatDate(userProfile.blockedAt)} by {userProfile.blockedBy}
                  </span>
                </div>
              )}
            </div>
          </div>

          {showActions && (
            <div className="flex gap-2">
              {userProfile.status === "pending" && (
                <>
                  <Button
                    size="sm"
                    onClick={() => setShowConfirmModal({ show: true, action: "approve", user: userProfile })}
                    disabled={actionLoading === userProfile.uid}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading === userProfile.uid ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Approve</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowConfirmModal({ show: true, action: "reject", user: userProfile })}
                    disabled={actionLoading === userProfile.uid}
                  >
                    {actionLoading === userProfile.uid ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserX className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Reject</span>
                      </>
                    )}
                  </Button>
                </>
              )}

              {userProfile.status === "approved" && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowConfirmModal({ show: true, action: "block", user: userProfile })}
                  disabled={actionLoading === userProfile.uid}
                >
                  {actionLoading === userProfile.uid ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShieldBan className="h-4 w-4 mr-1" />
                      Block
                    </>
                  )}
                </Button>
              )}

              {userProfile.status === "blocked" && (
                <Button
                  size="sm"
                  onClick={() => setShowConfirmModal({ show: true, action: "unblock", user: userProfile })}
                  disabled={actionLoading === userProfile.uid}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {actionLoading === userProfile.uid ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Unblock
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div className="ml-3">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Pending</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Approved</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.approved}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-600" />
              <div className="ml-3">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Rejected</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.rejected}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <ShieldBan className="h-8 w-8 text-red-600" />
              <div className="ml-3">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Blocked</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.blocked}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 sm:w-auto">
              <TabsTrigger value="pending" className="text-xs sm:text-sm px-2 sm:px-3">
                Pending ({stats.pending})
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs sm:text-sm px-2 sm:px-3">
                Approved ({stats.approved})
              </TabsTrigger>
              <TabsTrigger value="blocked" className="text-xs sm:text-sm px-2 sm:px-3">
                Blocked ({stats.blocked})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs sm:text-sm px-2 sm:px-3">
                Rejected ({stats.rejected})
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-3">
                All ({stats.total})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-6">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No pending users</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingUsers.map((u) => (
                    <UserCard key={u.uid} userProfile={u} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="approved" className="mt-6">
              {approvedUsers.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No approved users</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {approvedUsers.map((u) => (
                    <UserCard key={u.uid} userProfile={u} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="blocked" className="mt-6">
              {blockedUsers.length === 0 ? (
                <div className="text-center py-8">
                  <ShieldBan className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No blocked users</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {blockedUsers.map((u) => (
                    <UserCard key={u.uid} userProfile={u} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="rejected" className="mt-6">
              {rejectedUsers.length === 0 ? (
                <div className="text-center py-8">
                  <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No rejected users</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rejectedUsers.map((u) => (
                    <UserCard key={u.uid} userProfile={u} showActions={false} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-6">
              {allUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No users found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allUsers.map((u) => (
                    <UserCard key={u.uid} userProfile={u} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {showConfirmModal.show && showConfirmModal.user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>
                {showConfirmModal.action === "approve" && "Approve User"}
                {showConfirmModal.action === "reject" && "Reject User"}
                {showConfirmModal.action === "block" && "Block User"}
                {showConfirmModal.action === "unblock" && "Unblock User"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Are you sure you want to <strong>{showConfirmModal.action}</strong>{" "}
                <strong>{showConfirmModal.user.email}</strong>?
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowConfirmModal({ show: false, action: "approve", user: null })}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${
                    showConfirmModal.action === "approve"
                      ? "bg-green-600 hover:bg-green-700"
                      : showConfirmModal.action === "unblock"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                  onClick={confirmAction}
                  disabled={actionLoading !== null}
                >
                  {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
