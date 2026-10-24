import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 기존 프로젝트 문서를 next dev가 자동 수정하지 않도록 한다.
  agentRules: false,
  // 데이터 캐시는 후속 Phase에서 DB TTL로 관리한다.
  cacheComponents: false,
};

export default nextConfig;
