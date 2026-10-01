import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'kanbansync-board-app-7rnoxhw8',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_9V3aNcHj_Qz60EzT2btN2CPeE87_iPD_',
  authRequired: false,
  auth: { mode: 'managed' },
})
