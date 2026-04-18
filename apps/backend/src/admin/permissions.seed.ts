export const DEFAULT_PERMISSIONS = [
  // test_case
  { resource: "test_case", action: "create",       allowed: true  },
  { resource: "test_case", action: "edit",          allowed: true  },
  { resource: "test_case", action: "delete",        allowed: false },
  { resource: "test_case", action: "assign_self",   allowed: true  },
  { resource: "test_case", action: "assign_others", allowed: false },
  // test_run
  { resource: "test_run",  action: "create",        allowed: true  },
  { resource: "test_run",  action: "delete",        allowed: false },
  { resource: "test_run",  action: "execute",       allowed: true  },
  { resource: "test_run",  action: "view_all",      allowed: false },
  { resource: "test_run",  action: "view_own",      allowed: true  },
  // report
  { resource: "report",    action: "view_report",   allowed: false },
];
