import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/vision/:path*",
    "/rocks/:path*",
    "/todos/:path*",
    "/issues/:path*",
    "/scorecard/:path*",
    "/meetings/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/api/rocks/:path*",
    "/api/todos/:path*",
    "/api/issues/:path*",
    "/api/scorecard/:path*",
    "/api/users/:path*",
    "/marketing/:path*",
    "/api/marketing/:path*",
  ],
};
