export const PULL_THRESHOLD = 48;
export const MAX_PULL_DISTANCE = 225;
export const MAX_WORLD_PULL = 1.625;

export const createPullState = () => {
  let active: { pointerId: number; x: number; y: number } | null = null;
  let distance = 0;
  let activeKey: string | null = null;
  return {
    cancel() {
      active = null;
      activeKey = null;
      distance = 0;
    },
    beginKeyboard(key: string, repeat: boolean, disabled: boolean) {
      if ((key !== 'Enter' && key !== ' ') || repeat || disabled || active || activeKey)
        return false;
      activeKey = key;
      return true;
    },
    releaseKeyboard(key: string, disabled: boolean) {
      if (activeKey !== key) return false;
      activeKey = null;
      return !disabled;
    },
    begin(pointerId: number, x: number, y: number, hitRing: boolean, disabled: boolean) {
      if (active || activeKey || !hitRing || disabled) return false;
      active = { pointerId, x, y };
      distance = 0;
      return true;
    },
    move(pointerId: number, x: number, y: number) {
      if (!active || active.pointerId !== pointerId) return 0;
      distance = Math.min(MAX_PULL_DISTANCE, Math.hypot(x - active.x, y - active.y));
      return distance;
    },
    release(pointerId: number, disabled: boolean) {
      if (!active || active.pointerId !== pointerId) return false;
      const submit = !disabled && distance >= PULL_THRESHOLD;
      active = null;
      distance = 0;
      return submit;
    },
  };
};
