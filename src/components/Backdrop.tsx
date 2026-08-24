export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 gridlines" />
      <div className="absolute -top-44 left-1/2 h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-cyan-500/[0.09] blur-[150px]" />
      <div className="anim-floaty absolute top-1/3 -left-44 h-[440px] w-[440px] rounded-full bg-indigo-500/[0.09] blur-[130px]" />
      <div
        className="anim-floaty absolute -bottom-52 -right-36 h-[500px] w-[500px] rounded-full bg-fuchsia-500/[0.08] blur-[140px]"
        style={{ animationDelay: "-4.5s" }}
      />
    </div>
  );
}
