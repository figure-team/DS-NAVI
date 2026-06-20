package com.ex.service;

import com.ex.mapper.DataMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DataService {

  @Autowired
  private DataMapper dataMapper;

  public String load() {
    return dataMapper.fetch();
  }
}
