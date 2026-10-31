'use server';

import { logoutAdminAction as logoutAdminSession } from './admin-auth';

export async function logoutAdminAction() {
  await logoutAdminSession();
}
