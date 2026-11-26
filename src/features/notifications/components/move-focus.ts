/**
 * 操作した要素が消えたり無効になったりしてキーボード操作の起点が失われる場合に、`target` へフォーカスを移す。
 * 利用者がすでに別の要素へ移動していれば奪わない。
 *
 * @param target - 移動先の要素。null なら何もしない
 * @param scope - この要素の内側にあるフォーカスは、まもなく失われるものとして移す
 */
export function moveFocusIfLost(target: HTMLElement | null, scope: HTMLElement | null = null) {
  const active = document.activeElement;
  if (active === null || active === document.body || scope?.contains(active)) {
    // 操作した位置の近くへ移すため、画面はスクロールさせない
    target?.focus({ preventScroll: true });
  }
}
