export const PULL_THRESHOLD = 48;
export const MAX_PULL_DISTANCE = 90;

export const createPullState = () => {
  let active: { pointerId: number; x: number; y: number } | null = null;
  let distance = 0;
  return {
    cancel() {
      active = null;
      distance = 0;
    },
    begin(pointerId: number, x: number, y: number, hitRing: boolean, disabled: boolean) {
      if (active || !hitRing || disabled) return false;
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
