export const createDemandLoop = (
  render: () => boolean,
  request: (frame: () => void) => number,
  cancel: (id: number) => void,
) => {
  let frameId: number | null = null;
  let visible = true;
  let destroyed = false;
  const invalidate = () => {
    if (destroyed || !visible || frameId !== null) return;
    frameId = request(() => {
      frameId = null;
      if (!destroyed && visible && render()) invalidate();
    });
  };
  return {
    invalidate,
    setVisible(next: boolean) {
      visible = next;
      if (!visible && frameId !== null) {
        cancel(frameId);
        frameId = null;
      }
      if (visible) invalidate();
    },
    destroy() {
      destroyed = true;
      if (frameId !== null) cancel(frameId);
      frameId = null;
    },
  };
};
