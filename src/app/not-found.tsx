import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E] overflow-hidden">
      {/* Floating background shapes (matching login page) */}
      <div
        className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full bg-accent/10 blur-3xl animate-[float_6s_ease-in-out_infinite]"
      />
      <div
        className="absolute bottom-[-8%] right-[-5%] w-64 h-64 rounded-full bg-brand-light/15 blur-2xl animate-[float_8s_ease-in-out_infinite_1s]"
      />

      <div className="relative z-10 w-full max-w-md mx-4 text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center mb-8">
          <Image
            src="/logo-full-white.svg"
            alt="Amana OSHC"
            width={180}
            height={90}
            priority
          />
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-10 border border-white/50">
          <div className="text-6xl font-heading font-bold text-gray-200 mb-2">
            404
          </div>
          <h1 className="text-xl font-heading font-semibold text-gray-900 mb-2">
            Page not found
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center w-full py-3.5 px-4 bg-gradient-to-r from-brand to-brand-light hover:from-brand-hover hover:to-brand text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
          >
            Go to Dashboard
          </Link>
        </div>

        <p className="text-white/30 font-heading tracking-wider uppercase text-[11px] mt-6">
          Amana OSHC Leadership Team Portal
        </p>
      </div>
    </div>
  );
}
