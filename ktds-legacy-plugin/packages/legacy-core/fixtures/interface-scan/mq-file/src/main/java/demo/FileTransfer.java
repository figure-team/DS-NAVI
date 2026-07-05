package demo;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import java.net.ServerSocket;
import java.net.Socket;
import org.apache.commons.net.ftp.FTPClient;

public class FileTransfer {
  private static final String FTP_HOST = "ftp.example.com";

  public void sendViaSftp() throws Exception {
    JSch jsch = new JSch();
    Session session = jsch.getSession("batchuser", "sftp.example.com", 22);
  }

  public void sendViaFtp() throws Exception {
    FTPClient ftp = new FTPClient();
    ftp.connect(FTP_HOST);
  }

  public void rawSocket() throws Exception {
    Socket socket = new Socket("10.0.0.5", 9999);
    ServerSocket server = new ServerSocket(8888);
  }
}
