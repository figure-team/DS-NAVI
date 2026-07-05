package demo;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

@FeignClient(name = "pay-service", url = "${pay.api.url}")
public interface MemberFeign {
  @GetMapping("/v1/members")
  String members();
}
