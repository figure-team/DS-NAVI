package com.petstore.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 시큐리티 설정 — 보완 A 데모 대상("카카오 로그인 추가"). 엣지 해소는 필요 없고
 * 존재만 하면 된다(Spring Security 타입은 모두 프로젝트 외부 = unresolved=not-found).
 */
@Configuration
public class SecurityConfig {

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(auth -> auth
        .requestMatchers("/account/login", "/account/signon").permitAll()
        .anyRequest().authenticated())
      .formLogin(form -> form.loginPage("/account/login"));
    return http.build();
  }
}
