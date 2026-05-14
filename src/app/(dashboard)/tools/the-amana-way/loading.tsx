export default function Loading() {
  return (
    <div
      className="-mx-4 -mt-4 -mb-20 md:-mx-8 md:-mt-8 md:-mb-8 h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] overflow-hidden flex flex-col"
      style={{ background: "#FDFAF5" }}
    >
      <div style={{ background: "#1A4F5C", height: 76, flexShrink: 0 }} />
      <div
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #EDE8DF",
          height: 56,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }} />
    </div>
  );
}
