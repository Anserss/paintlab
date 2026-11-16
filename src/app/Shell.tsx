import { Outlet } from 'react-router-dom';

/** 应用外壳（spec 3.1 / 4.4）：左导航 72px + 顶部状态栏 44px + 内容区。
 *  正式实现见 store 就绪后的 Shell；此文件为 M0 基座占位。 */
export function Shell() {
  return (
    <div className="min-h-screen bg-bg-0 text-text-1">
      <Outlet />
    </div>
  );
}
