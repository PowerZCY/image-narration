'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

export function UserInitializer() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (isSignedIn && userId) {
      // 确保用户在数据库中存在
      fetch('/api/user/ensure', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            console.log('[UserInitializer] User ensured:', data.message);
          }
        })
        .catch(err => {
          console.error('[UserInitializer] Failed to ensure user:', err);
        });
    }
  }, [isSignedIn, userId]);

  return null;
}