"use client";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full p-8 bg-white rounded-xl shadow-lg text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Authentication error
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Something went wrong. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
