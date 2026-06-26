package com.example.member;

import org.springframework.security.access.prepost.PreAuthorize;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import javax.validation.constraints.Email;

public class MemberService {
  @NotNull
  @Email
  private String email;

  @Size(min = 8)
  private String password;

  @PreAuthorize("hasRole('ADMIN')")
  public void deleteMember(Long id) {
  }

  public void viewMember(Long id) {
  }
}
