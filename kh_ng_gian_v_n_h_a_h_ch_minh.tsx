import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs 
} from 'firebase/firestore';
import { 
  BookOpen, 
  Video as VideoIcon, 
  Award, 
  Users, 
  Plus, 
  Trash2, 
  ChevronRight, 
  LogOut, 
  Shield, 
  User as UserIcon, 
  ArrowLeft, 
  Check, 
  X, 
  Clock, 
  Download, 
  Eye, 
  FileText, 
  Trophy, 
  BarChart2, 
  Lock,
  Upload,
  File,
  Loader2,
  Globe,
  Share2
} from 'lucide-react';

// --- CONFIGURATION & FIREBASE SETUP ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ho-chi-minh-cultural-space';

// Mật khẩu quản trị viên bảo mật theo yêu cầu
const ADMIN_PASSWORD = "dominhkhang";

// Kích thước mỗi phân đoạn tệp tin (800KB để đảm bảo an toàn dưới mức giới hạn 1MB của Firestore Document)
const CHUNK_SIZE = 800 * 1024; 

export default function App() {
  // --- STATES ---
  const [user, setUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null); // 'user' | 'admin' | null
  const [dbUsers, setDbUsers] = useState([]); // Danh sách tài khoản từ DB
  const [loggedInUser, setLoggedInUser] = useState(null); // Thông tin người dùng đăng nhập thành công
  
  // Dữ liệu từ Firestore
  const [materials, setMaterials] = useState([]); // Sách, mẫu chuyện, video
  const [contests, setContests] = useState([]); // Các cuộc thi
  const [reports, setReports] = useState([]); // Báo cáo cuộc thi đã kết thúc

  // Điều hướng nội bộ
  const [userTab, setUserTab] = useState('materials'); 
  const [adminTab, setAdminTab] = useState('materials'); 
  const [activeMaterialType, setActiveMaterialType] = useState('video'); 

  // Trạng thái Đăng nhập
  const [userLoginUsername, setUserLoginUsername] = useState('');
  const [userLoginPassword, setUserLoginPassword] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  // Form Quản trị viên thêm tài liệu
  const [docCategory, setDocCategory] = useState('video');
  const [docTitle, setDocTitle] = useState('');
  const [docDesc, setDocDesc] = useState('');
  const [docContent, setDocContent] = useState('');
  
  // Trạng thái tệp tin đính kèm (hỗ trợ đến 100MB)
  const [selectedFileObj, setSelectedFileObj] = useState(null); // Đối tượng File gốc từ thiết bị
  const [uploadProgress, setUploadProgress] = useState(0); // % tải lên
  const [isUploading, setIsUploading] = useState(false); // Đang xử lý tải lên

  // Trạng thái lắp ráp & tải xuống tệp (Học viên)
  const [downloadProgress, setDownloadProgress] = useState(0); // % lắp ráp tệp
  const [isDownloading, setIsDownloading] = useState(false); // Trạng thái đang tải về/lắp ráp

  // Form Quản trị viên tạo cuộc thi
  const [contestStep, setContestStep] = useState(1);
  const [contestTitle, setContestTitle] = useState('Cuộc thi trả lời câu hỏi');
  const [contestDesc, setContestDesc] = useState('');
  const [contestQuestions, setContestQuestions] = useState([]);
  // Câu hỏi đang soạn thảo
  const [qText, setQText] = useState('');
  const [qA, setQA] = useState('');
  const [qB, setQB] = useState('');
  const [qC, setQC] = useState('');
  const [qD, setQD] = useState('');
  const [qCorrect, setQCorrect] = useState('A');

  // Form tạo tài khoản người dùng mới (Admin)
  const [newUsername, setNewUsername] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Trạng thái tham gia cuộc thi (Người dùng)
  const [activeContest, setActiveContest] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null); 
  const [timeLeft, setTimeLeft] = useState(20);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [contestFinished, setContestFinished] = useState(false);
  const timerRef = useRef(null);

  // Trạng thái xem trước tệp tin trực tuyến (Người dùng)
  const [previewMedia, setPreviewMedia] = useState(null); // { title, type, blobUrl }

  // Trạng thái sao chép liên kết giả lập
  const [copiedLink, setCopiedLink] = useState(false);

  // Trạng thái modal thông báo/xác nhận
  const [modalConfig, setModalConfig] = useState({ show: false, title: '', message: '', onConfirm: null });

  // --- AUTHENTICATION & INITIALIZATION ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- DATA SYNCING ---
  useEffect(() => {
    if (!user) return;

    // 1. Đồng bộ tài khoản người dùng
    const usersQuery = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const uList = [];
      snapshot.forEach(doc => {
        uList.push({ id: doc.id, ...doc.data() });
      });
      setDbUsers(uList);
    }, (err) => console.error("Error fetching users:", err));

    // 2. Đồng bộ tài liệu
    const materialsQuery = collection(db, 'artifacts', appId, 'public', 'data', 'materials');
    const unsubMaterials = onSnapshot(materialsQuery, (snapshot) => {
      const mList = [];
      snapshot.forEach(doc => {
        mList.push({ id: doc.id, ...doc.data() });
      });
      setMaterials(mList);
    }, (err) => console.error("Error fetching materials:", err));

    // 3. Đồng bộ cuộc thi
    const contestsQuery = collection(db, 'artifacts', appId, 'public', 'data', 'contests');
    const unsubContests = onSnapshot(contestsQuery, (snapshot) => {
      const cList = [];
      snapshot.forEach(doc => {
        cList.push({ id: doc.id, ...doc.data() });
      });
      setContests(cList);
    }, (err) => console.error("Error fetching contests:", err));

    // 4. Đồng bộ báo cáo cuộc thi
    const reportsQuery = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
    const unsubReports = onSnapshot(reportsQuery, (snapshot) => {
      const rList = [];
      snapshot.forEach(doc => {
        rList.push({ id: doc.id, ...doc.data() });
      });
      setReports(rList);
    }, (err) => console.error("Error fetching reports:", err));

    return () => {
      unsubUsers();
      unsubMaterials();
      unsubContests();
      unsubReports();
    };
  }, [user]);

  // Đồng bộ xu của tài khoản hiện tại khi danh sách users thay đổi
  useEffect(() => {
    if (loggedInUser) {
      const updated = dbUsers.find(u => u.id === loggedInUser.id);
      if (updated) {
        setLoggedInUser(updated);
      }
    }
  }, [dbUsers]);

  // --- TIMER LOGIC FOR CONTESTS ---
  useEffect(() => {
    if (activeContest && !contestFinished && selectedAnswer === null) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleTimeOut();
            return 20;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [activeContest, currentQuestionIndex, selectedAnswer, contestFinished]);

  // --- ACTIONS ---
  
  const showAlert = (title, message) => {
    setModalConfig({ show: true, title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirm) => {
    setModalConfig({ show: true, title, message, onConfirm });
  };

  // Đăng nhập người dùng
  const handleUserLogin = (e) => {
    e.preventDefault();
    const found = dbUsers.find(
      u => u.username.toLowerCase() === userLoginUsername.toLowerCase() && u.password === userLoginPassword
    );
    if (found) {
      setLoggedInUser(found);
      setUserLoginUsername('');
      setUserLoginPassword('');
    } else {
      showAlert("Đăng nhập thất bại", "Tên người dùng hoặc mật khẩu không chính xác. Vui lòng thử lại!");
    }
  };

  // Đăng nhập Admin
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setAdminLoggedIn(true);
      setAdminPasswordInput('');
    } else {
      showAlert("Đăng nhập thất bại", "Mật khẩu Quản trị viên không chính xác. Vui lòng thử lại!");
    }
  };

  // Đăng xuất
  const handleLogout = () => {
    setLoggedInUser(null);
    setAdminLoggedIn(false);
    setCurrentRole(null);
    setActiveContest(null);
    setContestFinished(false);
    setPreviewMedia(null);
  };

  // Kiểm soát tệp tin đính kèm đầu vào dưới 100MB
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) { // Giới hạn 100 MB
        showAlert("Tệp tin vượt giới hạn", "Vui lòng đính kèm các tệp có dung lượng nhỏ hơn 100 MB để hệ thống hoạt động ổn định nhất.");
        e.target.value = null;
        return;
      }
      setSelectedFileObj(file);
    }
  };

  // Hàm chuyển đổi phân đoạn blob sang Base64
  const readBlobAsBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Thêm tài liệu & Tải lên tệp phân mảnh (Admin)
  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!docTitle.trim()) {
      showAlert("Lỗi", "Vui lòng nhập tiêu đề tài liệu.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      let fileMeta = null;
      let totalChunks = 0;

      // 1. Tạo mới bản ghi tài liệu trước để nhận ID bản ghi
      const materialDocRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), {
        category: docCategory,
        title: docTitle,
        desc: docDesc,
        content: docContent || '',
        createdAt: new Date().toISOString(),
        hasFile: !!selectedFileObj
      });

      const materialId = materialDocRef.id;

      // 2. Nếu có đính kèm tệp, tiến hành phân nhỏ tệp và tải lên song song/tuần tự an toàn
      if (selectedFileObj) {
        totalChunks = Math.ceil(selectedFileObj.size / CHUNK_SIZE);
        
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(selectedFileObj.size, start + CHUNK_SIZE);
          const chunkBlob = selectedFileObj.slice(start, end);
          
          const base64Data = await readBlobAsBase64(chunkBlob);

          // Ghi từng phân đoạn tệp lên bộ sưu tập "fileChunks" theo đúng RULE 1
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fileChunks', `${materialId}_chunk_${i}`), {
            materialId,
            chunkIndex: i,
            data: base64Data
          });

          setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        fileMeta = {
          name: selectedFileObj.name,
          type: selectedFileObj.type,
          size: selectedFileObj.size,
          totalChunks: totalChunks
        };

        // Cập nhật lại thông tin tệp meta cho tài liệu
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'materials', materialId), {
          file: fileMeta
        });
      }

      setDocTitle('');
      setDocDesc('');
      setDocContent('');
      setSelectedFileObj(null);
      setIsUploading(false);
      setUploadProgress(0);
      showAlert("Thành công", `Đã đăng tải tài liệu vào danh mục ${docCategory === 'video' ? 'Video tư liệu' : docCategory === 'book' ? 'Sách' : 'Mẫu chuyện'}.`);
    } catch (err) {
      console.error(err);
      setIsUploading(false);
      showAlert("Lỗi", "Quá trình tải lên tệp tin thất bại. Vui lòng thử lại.");
    }
  };

  // Xóa tài liệu & Các phân đoạn tệp liên quan (Admin)
  const handleDeleteMaterial = (item) => {
    showConfirm("Xác nhận xóa", `Bạn có chắc chắn muốn xóa tài liệu "${item.title}"? Toàn bộ các phân đoạn tệp liên quan cũng sẽ được xóa sạch.`, async () => {
      try {
        // Xóa tài liệu chính
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'materials', item.id));

        // Xóa các file chunks nếu có tệp đính kèm
        if (item.file && item.file.totalChunks) {
          for (let i = 0; i < item.file.totalChunks; i++) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fileChunks', `${item.id}_chunk_${i}`));
          }
        }
        showAlert("Thành công", "Đã xóa hoàn toàn tài liệu.");
      } catch (err) {
        console.error(err);
        showAlert("Lỗi", "Không thể xóa tài liệu.");
      }
    });
  };

  // Hàm lắp ráp các mảnh nhỏ thành một Blob duy nhất (Học viên)
  const fetchAndAssembleFile = async (materialItem) => {
    if (!materialItem.file || !materialItem.file.totalChunks) return null;
    
    setIsDownloading(true);
    setDownloadProgress(0);

    const totalChunks = materialItem.file.totalChunks;
    const blobSlices = [];

    try {
      // Đọc các chunks từ bộ nhớ Firestore
      for (let i = 0; i < totalChunks; i++) {
        const chunkDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'fileChunks', `${materialItem.id}_chunk_${i}`);
        const chunkDoc = await getDoc(chunkDocRef);
        
        if (chunkDoc.exists()) {
          const base64WithHeader = chunkDoc.data().data;
          // Giải mã Base64 sang nhị phân
          const sliceBlob = base64ToBlob(base64WithHeader, materialItem.file.type);
          blobSlices.push(sliceBlob);
        }
        
        setDownloadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      const finalBlob = new Blob(blobSlices, { type: materialItem.file.type });
      setIsDownloading(false);
      setDownloadProgress(0);
      return finalBlob;
    } catch (err) {
      console.error(err);
      setIsDownloading(false);
      setDownloadProgress(0);
      showAlert("Lỗi kết nối", "Không thể lắp ráp và tải xuống tệp tin. Vui lòng kiểm tra lại đường truyền mạng.");
      return null;
    }
  };

  // Helper hỗ trợ chuyển Base64 an toàn sang Blob
  const base64ToBlob = (base64WithHeader, defaultType) => {
    const commaIdx = base64WithHeader.indexOf(',');
    const contentType = commaIdx !== -1 ? base64WithHeader.substring(5, base64WithHeader.indexOf(';')) : defaultType;
    const rawBase64 = commaIdx !== -1 ? base64WithHeader.substring(commaIdx + 1) : base64WithHeader;
    
    const sliceSize = 1024;
    const byteCharacters = atob(rawBase64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
  };

  // Trực quan xem tệp tin trực tiếp
  const handlePreviewFile = async (item) => {
    const assembledBlob = await fetchAndAssembleFile(item);
    if (assembledBlob) {
      const blobUrl = URL.createObjectURL(assembledBlob);
      setPreviewMedia({
        title: item.title,
        type: item.file.type,
        blobUrl: blobUrl,
        blob: assembledBlob,
        name: item.file.name
      });
    }
  };

  // Tải trực tiếp tệp về máy khách hàng
  const handleDownloadFile = async (item) => {
    const assembledBlob = await fetchAndAssembleFile(item);
    if (assembledBlob) {
      const url = URL.createObjectURL(assembledBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Sao chép đường dẫn giả lập ra bộ nhớ tạm (clipboard)
  const handleCopyLink = () => {
    const dummyInput = document.createElement('input');
    dummyInput.value = 'https://khonggianvanhoahcm.vn';
    document.body.appendChild(dummyInput);
    dummyInput.select();
    document.execCommand('copy');
    document.body.removeChild(dummyInput);
    
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    showAlert("Sao chép thành công", "Đường dẫn cổng thông tin https://khonggianvanhoahcm.vn đã được lưu vào bộ nhớ tạm.");
  };

  // Tạo câu hỏi cuộc thi
  const handleAddQuestion = () => {
    if (!qText.trim() || !qA.trim() || !qB.trim() || !qC.trim() || !qD.trim()) {
      showAlert("Thiếu thông tin", "Vui lòng điền nội dung câu hỏi và tất cả 4 đáp án.");
      return;
    }
    const newQ = {
      question: qText,
      options: { A: qA, B: qB, C: qC, D: qD },
      correct: qCorrect
    };
    setContestQuestions([...contestQuestions, newQ]);
    setQText('');
    setQA('');
    setQB('');
    setQC('');
    setQD('');
    setQCorrect('A');
  };

  // Hoàn tất lưu cuộc thi (Admin)
  const handleSaveContest = async () => {
    if (contestQuestions.length === 0) {
      showAlert("Lỗi", "Cuộc thi phải có ít nhất một câu hỏi.");
      return;
    }
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'contests'), {
        title: contestTitle,
        desc: contestDesc,
        questions: contestQuestions,
        status: 'active', 
        createdAt: new Date().toISOString()
      });
      setContestTitle('Cuộc thi trả lời câu hỏi');
      setContestDesc('');
      setContestQuestions([]);
      setContestStep(1);
      showAlert("Thành công", "Cuộc thi mới đã được tạo và hiển thị ngay cho người dùng!");
    } catch (err) {
      console.error(err);
      showAlert("Lỗi", "Không thể lưu cuộc thi.");
    }
  };

  // Kết thúc cuộc thi (Admin)
  const handleEndContest = async (contestItem) => {
    showConfirm("Kết thúc cuộc thi", `Bạn có chắc chắn muốn kết thúc cuộc thi "${contestItem.title}"? Người dùng sẽ không thể tham gia nữa.`, async () => {
      try {
        const participantStats = dbUsers.filter(u => u.contestsFinished && u.contestsFinished[contestItem.id]).map(u => {
          const stats = u.contestsFinished[contestItem.id];
          return {
            fullName: u.fullName,
            username: u.username,
            correct: stats.correct || 0,
            wrong: stats.wrong || 0,
            goldCoins: u.goldCoins || 0
          };
        });

        // Lưu báo cáo
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), {
          contestId: contestItem.id,
          contestTitle: contestItem.title,
          endedAt: new Date().toISOString(),
          participants: participantStats
        });

        // Khóa cuộc thi
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contests', contestItem.id), {
          status: 'ended'
        });

        // Reset xu vàng của tất cả người dùng về 0 sau khi lưu báo cáo tổng kết
        for (const u of dbUsers) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), {
            goldCoins: 0
          });
        }

        showAlert("Thành công", "Đã kết thúc cuộc thi, lập báo cáo tổng kết và đặt số xu của mọi người dùng về 0.");
      } catch (err) {
        console.error(err);
        showAlert("Lỗi", "Không thể kết thúc cuộc thi.");
      }
    });
  };

  // Xóa cuộc thi hoàn toàn (Admin)
  const handleDeleteContest = (contestItem) => {
    showConfirm("Xóa cuộc thi", `Bạn có chắc chắn muốn xóa cuộc thi "${contestItem.title}" và toàn bộ dữ liệu lịch sử liên quan? Số xu của những người tham gia liên quan sẽ được đưa về 0.`, async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contests', contestItem.id));

        const relatedReports = reports.filter(r => r.contestId === contestItem.id);
        for (const rep of relatedReports) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', rep.id));
        }

        for (const u of dbUsers) {
          const updatedContests = { ...(u.contestsFinished || {}) };
          if (updatedContests[contestItem.id]) {
            delete updatedContests[contestItem.id];
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), {
              goldCoins: 0,
              contestsFinished: updatedContests
            });
          }
        }

        showAlert("Thành công", "Đã xóa hoàn toàn cuộc thi và đặt lại xu vàng liên quan về 0.");
      } catch (err) {
        console.error(err);
        showAlert("Lỗi", "Không thể xóa cuộc thi.");
      }
    });
  };

  // Tạo tài khoản người dùng mới (Admin)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserFullName.trim() || !newUserPassword.trim()) {
      showAlert("Thiếu thông tin", "Vui lòng nhập đầy đủ thông tin tài khoản.");
      return;
    }
    const exists = dbUsers.some(u => u.username.toLowerCase() === newUsername.trim().toLowerCase());
    if (exists) {
      showAlert("Lỗi", "Tên người dùng này đã tồn tại trong hệ thống.");
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
        username: newUsername.trim(),
        fullName: newUserFullName.trim(),
        password: newUserPassword,
        goldCoins: 0,
        contestsFinished: {}, 
        createdAt: new Date().toISOString()
      });
      setNewUsername('');
      setNewUserFullName('');
      setNewUserPassword('');
      showAlert("Thành công", "Đã tạo tài khoản thành công!");
    } catch (err) {
      console.error(err);
      showAlert("Lỗi", "Không thể tạo tài khoản.");
    }
  };

  // Xóa tài khoản người dùng (Admin)
  const handleDeleteUser = (userId, userName) => {
    showConfirm("Xác nhận xóa", `Bạn có thực sự muốn xóa tài khoản "${userName}"? Thao tác này không thể hoàn tác.`, async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId));
        showAlert("Thành công", "Đã xóa tài khoản.");
      } catch (err) {
        console.error(err);
        showAlert("Lỗi", "Không thể xóa tài khoản.");
      }
    });
  };

  // Trả lời câu hỏi cuộc thi (Học viên)
  const handleJoinContest = (contestItem) => {
    if (loggedInUser.contestsFinished && loggedInUser.contestsFinished[contestItem.id]) {
      showAlert("Thông báo", "Bạn đã hoàn thành cuộc thi này trước đó.");
      return;
    }
    setActiveContest(contestItem);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setTimeLeft(20);
    setCorrectCount(0);
    setWrongCount(0);
    setContestFinished(false);
  };

  const handleAnswerSelect = (optionKey) => {
    if (selectedAnswer !== null) return; 
    clearInterval(timerRef.current);
    setSelectedAnswer(optionKey);

    const questionObj = activeContest.questions[currentQuestionIndex];
    const isCorrect = optionKey === questionObj.correct;
    let newCoins = loggedInUser.goldCoins || 0;

    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
      newCoins += 1;
    } else {
      setWrongCount(prev => prev + 1);
      newCoins -= 1;
    }

    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', loggedInUser.id), {
      goldCoins: newCoins
    });

    setTimeout(() => {
      moveToNextQuestion();
    }, 1500);
  };

  const handleTimeOut = () => {
    setSelectedAnswer('TIMEOUT');
    setWrongCount(prev => prev + 1);

    let newCoins = (loggedInUser.goldCoins || 0) - 1;
    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', loggedInUser.id), {
      goldCoins: newCoins
    });

    setTimeout(() => {
      moveToNextQuestion();
    }, 2000);
  };

  const moveToNextQuestion = () => {
    if (currentQuestionIndex + 1 < activeContest.questions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setTimeLeft(20);
    } else {
      finishContest();
    }
  };

  const finishContest = async () => {
    setContestFinished(true);
    const updatedHistory = { ...(loggedInUser.contestsFinished || {}) };
    updatedHistory[activeContest.id] = {
      correct: correctCount,
      wrong: wrongCount,
      finishedAt: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', loggedInUser.id), {
        contestsFinished: updatedHistory
      });
    } catch (err) {
      console.error("Lỗi cập nhật lịch sử cuộc thi:", err);
    }
  };

  const handleCloseContestScreen = () => {
    setActiveContest(null);
    setContestFinished(false);
  };

  // Bảng xếp hạng: Sắp xếp người dùng theo số xu giảm dần
  const sortedUsers = [...dbUsers].sort((a, b) => (b.goldCoins || 0) - (a.goldCoins || 0));

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 flex flex-col antialiased">
      {/* --- HEADER --- */}
      <header className="sticky top-0 z-40 bg-red-700 text-white shadow-md transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3 cursor-pointer animate-fadeIn" onClick={() => handleLogout()}>
            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center font-bold text-red-800 text-xl shadow-inner">
              ★
            </div>
            <div>
              <h1 className="font-bold text-base md:text-xl tracking-tight leading-tight">Không gian Văn hóa</h1>
              <p className="text-xs text-yellow-200">Hồ Chí Minh</p>
            </div>
          </div>

          {/* Hiển thị thanh địa chỉ hệ thống trực quan */}
          <div className="hidden lg:flex items-center space-x-2 bg-red-800/40 border border-red-600/30 px-3 py-1 rounded-full text-xs text-red-100">
            <Globe size={13} className="text-yellow-300" />
            <span className="font-mono">https://khonggianvanhoahcm.vn</span>
            <button 
              onClick={handleCopyLink} 
              className="ml-1 p-1 hover:bg-red-700/50 rounded-full transition-colors"
              title="Sao chép liên kết"
            >
              <Share2 size={12} />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {loggedInUser && (
              <div className="flex items-center space-x-3 bg-red-800/60 px-4 py-1.5 rounded-full border border-red-600">
                <div className="flex items-center space-x-1">
                  <UserIcon size={16} className="text-yellow-300" />
                  <span className="text-sm font-semibold max-w-[100px] truncate">{loggedInUser.fullName}</span>
                </div>
                <div className="h-4 w-px bg-red-600"></div>
                <div className="flex items-center space-x-1 bg-yellow-400 text-red-950 px-2 py-0.5 rounded-full text-xs font-bold">
                  <span>{loggedInUser.goldCoins ?? 0} xu</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1 hover:bg-red-600 rounded-full transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}

            {adminLoggedIn && (
              <div className="flex items-center space-x-2 bg-stone-800 px-3 py-1.5 rounded-full border border-stone-700 text-sm">
                <span className="flex items-center text-yellow-400 font-bold gap-1 text-xs md:text-sm">
                  <Shield size={14} /> Quản trị viên
                </span>
                <button 
                  onClick={handleLogout}
                  className="p-1 hover:bg-stone-700 rounded-full text-stone-300 transition-colors"
                  title="Đăng xuất khỏi Quản trị"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --- TIẾN TRÌNH TẢI / LẮP RÁP FILE CHUNG CHO CẢ WEBSITE --- */}
      {isDownloading && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 py-2.5 px-4 sticky top-[53px] z-30 shadow-sm animate-pulse">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
            <span className="text-xs md:text-sm font-bold flex items-center gap-2">
              <Loader2 className="animate-spin text-amber-700 shrink-0" size={16} />
              Đang lắp ráp tệp dữ liệu lớn trực tuyến từ đám mây ({downloadProgress}%)... Vui lòng giữ trình duyệt mở.
            </span>
            <div className="w-full md:w-64 bg-stone-200 rounded-full h-2.5 overflow-hidden">
              <div className="bg-amber-600 h-2.5 transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN BODY --- */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
        
        {/* 1. TRANG CHỦ LỰA CHỌN VAI TRÒ */}
        {!loggedInUser && !adminLoggedIn && currentRole === null && (
          <div className="flex flex-col items-center justify-center py-12 md:py-20 text-center">
            
            {/* Huy hiệu quảng bá địa chỉ URL cổng kết nối */}
            <div 
              onClick={handleCopyLink}
              className="mb-8 flex items-center gap-2 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 text-yellow-900 px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors shadow-sm animate-bounce"
            >
              <Globe size={14} className="text-yellow-600" />
              <span>Cổng truy cập chính thức: <strong className="underline">https://khonggianvanhoahcm.vn</strong></span>
            </div>

            <div className="mb-6 transform hover:scale-105 transition-transform duration-300">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto border-4 border-red-500 shadow-md">
                <span className="text-red-600 text-5xl">★</span>
              </div>
            </div>
            
            <h2 className="text-4xl md:text-5xl font-extrabold text-red-800 tracking-tight mb-2 animate-fadeIn">
              Chào mừng
            </h2>
            <p className="text-stone-600 max-w-lg mb-10 text-base md:text-lg">
              Đến với ứng dụng học tập, trải nghiệm trực tuyến <br />
              <strong className="text-red-700">Không gian Văn hóa Hồ Chí Minh</strong>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl px-4">
              {/* Lựa chọn Người dùng */}
              <button
                onClick={() => setCurrentRole('user')}
                className="group p-6 bg-white rounded-3xl border-2 border-stone-200 hover:border-red-500 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex items-start space-x-4"
              >
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <UserIcon size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-stone-950 group-hover:text-red-700 transition-colors">Người dùng</h3>
                  <p className="text-stone-500 text-sm mt-1">Đăng nhập để xem video, sách, truyện, tham gia cuộc thi trắc nghiệm và tích xu vàng.</p>
                </div>
              </button>

              {/* Lựa chọn Quản trị viên */}
              <button
                onClick={() => setCurrentRole('admin')}
                className="group p-6 bg-white rounded-3xl border-2 border-stone-200 hover:border-stone-800 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex items-start space-x-4"
              >
                <div className="p-3 bg-stone-100 text-stone-700 rounded-2xl group-hover:bg-stone-800 group-hover:text-white transition-colors">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-stone-950 group-hover:text-stone-800 transition-colors">Quản trị viên</h3>
                  <p className="text-stone-500 text-sm mt-1">Quản lý nội dung tài liệu, tạo và thống kê cuộc thi, quản trị tài khoản học viên.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 2. CỬA SỔ ĐĂNG NHẬP NGƯỜI DÙNG */}
        {currentRole === 'user' && !loggedInUser && (
          <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="bg-red-700 text-white p-6 text-center relative">
              <button 
                onClick={() => setCurrentRole(null)} 
                className="absolute left-6 top-6 text-white hover:text-yellow-200"
              >
                <ArrowLeft size={20} />
              </button>
              <h3 className="font-bold text-xl">Đăng nhập Người dùng</h3>
              <p className="text-xs text-red-200 mt-1">Sử dụng tài khoản do Quản trị viên cấp</p>
            </div>

            <form onSubmit={handleUserLogin} className="p-6 md:p-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Tên người dùng</label>
                <input 
                  type="text"
                  required
                  placeholder="Nhập tên đăng nhập"
                  value={userLoginUsername}
                  onChange={(e) => setUserLoginUsername(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-full border border-stone-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Mật khẩu</label>
                <input 
                  type="password"
                  required
                  placeholder="••••••••"
                  value={userLoginPassword}
                  onChange={(e) => setUserLoginPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-full border border-stone-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm transition-all"
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-full font-bold transition-all shadow-md text-sm active:scale-95"
                >
                  Đăng nhập
                </button>
              </div>

              <button 
                type="button"
                onClick={() => setCurrentRole(null)}
                className="w-full text-center text-xs text-stone-500 hover:underline mt-2 block"
              >
                Quay lại trang chủ
              </button>
            </form>
          </div>
        )}

        {/* 3. CỬA SỔ ĐĂNG NHẬP ADMIN */}
        {currentRole === 'admin' && !adminLoggedIn && (
          <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="bg-stone-900 text-white p-6 text-center relative">
              <button 
                onClick={() => setCurrentRole(null)} 
                className="absolute left-6 top-6 text-white hover:text-yellow-200"
              >
                <ArrowLeft size={20} />
              </button>
              <h3 className="font-bold text-xl">Xác thực Quản trị</h3>
              <p className="text-xs text-stone-400 mt-1">Nhập mật khẩu quyền quản trị tối cao</p>
            </div>

            <form onSubmit={handleAdminLogin} className="p-6 md:p-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Mật khẩu quản trị</label>
                <input 
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-800 focus:border-stone-800 outline-none text-sm transition-all"
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-stone-900 hover:bg-stone-850 text-white py-3 rounded-full font-bold transition-all shadow-md text-sm active:scale-95"
                >
                  Xác nhận truy cập
                </button>
              </div>

              <button 
                type="button"
                onClick={() => setCurrentRole(null)}
                className="w-full text-center text-xs text-stone-500 hover:underline mt-2 block"
              >
                Quay lại trang chủ
              </button>
            </form>
          </div>
        )}

        {/* =======================================================
            4. GIAO DIỆN CHÍNH NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP 
            ======================================================= */}
        {loggedInUser && (
          <div className="space-y-6">
            
            {/* Nếu đang THAM GIA CUỘC THI */}
            {activeContest ? (
              <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden animate-fadeIn">
                {/* Header cuộc thi */}
                <div className="bg-gradient-to-r from-red-700 to-red-800 text-white p-6 relative">
                  {!contestFinished && (
                    <button 
                      onClick={() => {
                        showConfirm("Thoát cuộc thi", "Bạn muốn thoát khỏi cuộc thi này? Kết quả thi sẽ không được ghi nhận hoàn tất.", () => {
                          handleCloseContestScreen();
                        });
                      }}
                      className="absolute left-6 top-6 hover:text-yellow-200"
                    >
                      <ArrowLeft size={20} />
                    </button>
                  )}
                  <div className="text-center">
                    <span className="bg-red-900/50 text-yellow-300 text-xs px-3 py-1 rounded-full font-bold tracking-wider uppercase">
                      Đang diễn ra
                    </span>
                    <h3 className="font-bold text-xl md:text-2xl mt-2">{activeContest.title}</h3>
                    <p className="text-xs text-red-200 mt-1">{activeContest.desc}</p>
                  </div>
                </div>

                {/* Nội dung chính cuộc thi */}
                {!contestFinished ? (
                  <div className="p-6 md:p-8 space-y-6">
                    {/* Tiến trình và Đồng hồ */}
                    <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <div>
                        <span className="text-xs text-stone-500 block uppercase font-bold tracking-wider">Tiến trình</span>
                        <span className="text-lg font-extrabold text-red-700">
                          Câu {currentQuestionIndex + 1} / {activeContest.questions.length}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 bg-red-50 text-red-700 px-4 py-2 rounded-full border border-red-100">
                        <Clock size={18} className="animate-pulse" />
                        <span className="font-extrabold text-lg">{timeLeft}s</span>
                      </div>
                    </div>

                    {/* Câu hỏi */}
                    <div>
                      <h4 className="text-lg md:text-xl font-bold text-stone-900 leading-snug">
                        {activeContest.questions[currentQuestionIndex].question}
                      </h4>
                    </div>

                    {/* Danh sách 4 Đáp án */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['A', 'B', 'C', 'D'].map((optionKey) => {
                        const optionText = activeContest.questions[currentQuestionIndex].options[optionKey];
                        const isSelected = selectedAnswer === optionKey;
                        const correctAns = activeContest.questions[currentQuestionIndex].correct;
                        const isCorrectOption = optionKey === correctAns;

                        let btnStyle = "bg-white border-stone-200 text-stone-800 hover:border-red-400 hover:bg-stone-50";
                        
                        if (selectedAnswer !== null) {
                          if (isCorrectOption) {
                            btnStyle = "bg-emerald-100 border-emerald-500 text-emerald-800 font-bold";
                          } else if (isSelected && !isCorrectOption) {
                            btnStyle = "bg-red-100 border-red-500 text-red-800 font-bold";
                          } else {
                            btnStyle = "bg-stone-50 border-stone-200 text-stone-400 opacity-60";
                          }
                        }

                        return (
                          <button
                            key={optionKey}
                            disabled={selectedAnswer !== null}
                            onClick={() => handleAnswerSelect(optionKey)}
                            className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-start space-x-3 text-sm md:text-base ${btnStyle}`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              selectedAnswer !== null && isCorrectOption ? "bg-emerald-500 text-white" :
                              selectedAnswer !== null && isSelected && !isCorrectOption ? "bg-red-500 text-white" :
                              "bg-stone-100 text-stone-600"
                            }`}>
                              {optionKey}
                            </span>
                            <span className="flex-1">{optionText}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Trạng thái hết giờ */}
                    {selectedAnswer === 'TIMEOUT' && (
                      <div className="text-center p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl font-bold text-sm animate-bounce">
                        Hết thời gian trả lời! Bạn bị trừ 1 xu vàng.
                      </div>
                    )}
                  </div>
                ) : (
                  // Hoàn thành cuộc thi
                  <div className="p-8 text-center space-y-6">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                      <Award size={48} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-stone-900">Hoàn thành cuộc thi!</h3>
                      <p className="text-stone-500 mt-2">Cảm ơn bạn đã tham gia trả lời các câu hỏi về Văn hóa Hồ Chí Minh.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <div className="text-center">
                        <span className="text-xs text-stone-500 block">Trả lời đúng</span>
                        <span className="text-2xl font-bold text-emerald-600">{correctCount} câu</span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-stone-500 block">Trả lời sai/Hết giờ</span>
                        <span className="text-2xl font-bold text-red-500">{wrongCount} câu</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        onClick={handleCloseContestScreen}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-full transition-all shadow-md active:scale-95"
                      >
                        Đóng và Quay lại
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Navigation Tabs Người dùng
              <div className="space-y-6">
                {/* Thanh điều hướng */}
                <div className="flex overflow-x-auto gap-2 bg-stone-200/60 p-1.5 rounded-full border border-stone-200 max-w-lg">
                  <button
                    onClick={() => setUserTab('materials')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                      userTab === 'materials' ? 'bg-white text-red-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <BookOpen size={16} /> Tài liệu
                  </button>
                  <button
                    onClick={() => setUserTab('contests')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                      userTab === 'contests' ? 'bg-white text-red-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Award size={16} /> Cuộc thi
                  </button>
                  <button
                    onClick={() => setUserTab('leaderboard')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                      userTab === 'leaderboard' ? 'bg-white text-red-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Trophy size={16} /> Bảng xếp hạng
                  </button>
                </div>

                {/* TAB 1: TÀI LIỆU (VIDEO TƯ LIỆU, SÁCH, MẪU CHUYỆN) */}
                {userTab === 'materials' && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Sub-tabs tài liệu */}
                    <div className="flex gap-4 border-b border-stone-200 pb-px">
                      {[
                        { id: 'video', label: 'Video tư liệu', icon: VideoIcon },
                        { id: 'book', label: 'Sách', icon: BookOpen },
                        { id: 'story', label: 'Mẫu chuyện', icon: FileText }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveMaterialType(tab.id)}
                          className={`flex items-center gap-2 pb-3 text-sm font-bold tracking-tight border-b-2 transition-all ${
                            activeMaterialType === tab.id 
                              ? 'border-red-600 text-red-700' 
                              : 'border-transparent text-stone-500 hover:text-stone-800'
                          }`}
                        >
                          <tab.icon size={16} />
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Danh sách tài liệu */}
                    {materials.filter(m => m.category === activeMaterialType).length === 0 ? (
                      <div className="py-16 text-center text-stone-400 bg-white rounded-3xl border border-dashed border-stone-200">
                        “Không có nội dung hiển thị.”
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {materials
                          .filter(m => m.category === activeMaterialType)
                          .map((item) => (
                            <div 
                              key={item.id} 
                              className="bg-white rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
                            >
                              <div className="p-5 space-y-3 flex-1 flex flex-col">
                                <div className="flex justify-between items-start">
                                  <span className="bg-stone-100 text-stone-600 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full">
                                    {item.category === 'video' ? 'Video tư liệu' : item.category === 'book' ? 'Sách' : 'Mẫu chuyện'}
                                  </span>
                                </div>
                                <h4 className="font-bold text-stone-900 text-base line-clamp-2">{item.title}</h4>
                                <p className="text-stone-500 text-xs line-clamp-3">{item.desc}</p>
                                
                                {item.content && (
                                  <div className="mt-3 p-3 bg-stone-50 rounded-2xl border border-stone-100 text-xs text-stone-600 line-clamp-4 italic flex-1">
                                    {item.content}
                                  </div>
                                )}

                                {item.file && (
                                  <div className="mt-3 p-2.5 bg-red-50/50 rounded-xl border border-red-100 flex items-center gap-2 text-[11px] text-stone-700">
                                    <File size={14} className="text-red-700 shrink-0" />
                                    <span className="truncate font-semibold flex-1">{item.file.name}</span>
                                    <span className="text-stone-400 shrink-0">({(item.file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                                  </div>
                                )}
                              </div>

                              <div className="p-5 pt-0 flex gap-2">
                                {item.file && (
                                  <button
                                    onClick={() => handlePreviewFile(item)}
                                    disabled={isDownloading}
                                    className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-bold py-2.5 px-4 rounded-full flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                  >
                                    <Eye size={14} /> Xem trực tuyến
                                  </button>
                                )}
                                
                                <button
                                  onClick={() => {
                                    if (item.file) {
                                      handleDownloadFile(item);
                                    } else {
                                      const element = document.createElement("a");
                                      const fileBlob = new Blob([item.content || item.desc], {type: 'text/plain'});
                                      element.href = URL.createObjectURL(fileBlob);
                                      element.download = `${item.title}.txt`;
                                      document.body.appendChild(element);
                                      element.click();
                                      document.body.removeChild(element);
                                    }
                                  }}
                                  disabled={isDownloading}
                                  className="bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-xs font-bold py-2.5 px-4 rounded-full flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                >
                                  <Download size={14} /> Tải xuống
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: CUỘC THI */}
                {userTab === 'contests' && (
                  <div className="space-y-4 animate-fadeIn">
                    <h3 className="text-lg font-bold text-stone-900">Danh sách các cuộc thi trắc nghiệm</h3>
                    {contests.length === 0 ? (
                      <div className="py-16 text-center text-stone-400 bg-white rounded-3xl border border-dashed border-stone-200">
                        “Không có nội dung hiển thị.”
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {contests.map((item) => {
                          const hasTaken = loggedInUser.contestsFinished && loggedInUser.contestsFinished[item.id];
                          const isEnded = item.status === 'ended';

                          return (
                            <div 
                              key={item.id} 
                              className={`bg-white rounded-3xl border p-6 flex flex-col justify-between transition-all ${
                                isEnded ? 'border-stone-200 bg-stone-50/50 opacity-80' : 'border-stone-200 shadow-sm hover:shadow-md'
                              }`}
                            >
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full ${
                                    isEnded ? 'bg-stone-200 text-stone-600' : 
                                    hasTaken ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {isEnded ? 'Đã kết thúc' : hasTaken ? 'Đã tham gia' : 'Chưa tham gia'}
                                  </span>
                                  <span className="text-xs text-stone-400">
                                    {item.questions?.length || 0} câu hỏi
                                  </span>
                                </div>
                                <h4 className="font-bold text-stone-900 text-lg leading-tight">{item.title}</h4>
                                <p className="text-stone-500 text-sm line-clamp-3">{item.desc}</p>

                                {hasTaken && (
                                  <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-800 flex justify-between items-center">
                                    <span>Kết quả thi của bạn:</span>
                                    <span className="font-bold">
                                      {loggedInUser.contestsFinished[item.id].correct} Đúng - {loggedInUser.contestsFinished[item.id].wrong} Sai
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="pt-6">
                                {isEnded ? (
                                  <button
                                    disabled
                                    className="w-full bg-stone-200 text-stone-500 text-sm font-bold py-3 px-4 rounded-full cursor-not-allowed"
                                  >
                                    Cuộc thi đã bị khóa
                                  </button>
                                ) : hasTaken ? (
                                  <button
                                    disabled
                                    className="w-full bg-emerald-100 text-emerald-700 text-sm font-bold py-3 px-4 rounded-full flex items-center justify-center gap-1.5 cursor-not-allowed"
                                  >
                                    <Check size={16} /> Đã hoàn thành
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleJoinContest(item)}
                                    className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3 px-4 rounded-full flex items-center justify-center gap-1.5 transition-colors shadow-sm active:scale-95"
                                  >
                                    Tham gia cuộc thi <ChevronRight size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: BẢNG XẾP HẠNG */}
                {userTab === 'leaderboard' && (
                  <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden max-w-2xl mx-auto animate-fadeIn">
                    <div className="bg-gradient-to-r from-yellow-500 to-amber-600 text-white p-6 text-center">
                      <Trophy size={36} className="mx-auto mb-2 text-yellow-200" />
                      <h3 className="font-black text-xl md:text-2xl">Bảng xếp hạng vàng</h3>
                      <p className="text-xs text-yellow-100 mt-1">Sắp xếp theo số xu vàng tích lũy qua các cuộc thi</p>
                    </div>

                    <div className="divide-y divide-stone-150">
                      {sortedUsers.map((item, index) => {
                        const isSelf = item.id === loggedInUser.id;
                        let rankBadge = "bg-stone-100 text-stone-700";
                        if (index === 0) rankBadge = "bg-yellow-400 text-yellow-950 font-black";
                        if (index === 1) rankBadge = "bg-stone-300 text-stone-800 font-black";
                        if (index === 2) rankBadge = "bg-orange-300 text-orange-950 font-black";

                        return (
                          <div 
                            key={item.id} 
                            className={`flex items-center justify-between px-6 py-4 transition-colors ${
                              isSelf ? 'bg-amber-50/60' : 'hover:bg-stone-50'
                            }`}
                          >
                            <div className="flex items-center space-x-4">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${rankBadge}`}>
                                {index + 1}
                              </span>
                              <div>
                                <h4 className="font-bold text-stone-900 flex items-center gap-1.5">
                                  {item.fullName}
                                  {isSelf && <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full">Bạn</span>}
                                </h4>
                                <p className="text-stone-400 text-xs">@{item.username}</p>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className={`font-black text-lg ${
                                (item.goldCoins ?? 0) >= 0 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {item.goldCoins ?? 0}
                              </span>
                              <span className="text-stone-400 text-xs">xu</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

        {/* =======================================================
            5. GIAO DIỆN CHÍNH QUẢN TRỊ VIÊN ĐÃ ĐĂNG NHẬP 
            ======================================================= */}
        {adminLoggedIn && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
            
            {/* Thanh menu quản trị bên trái */}
            <div className="bg-white rounded-3xl border border-stone-200 p-5 space-y-2 h-fit flex flex-col justify-between">
              <div>
                <div className="pb-4 mb-2 border-b border-stone-150">
                  <h3 className="font-bold text-stone-900 text-base flex items-center gap-2">
                    <Shield size={18} className="text-red-700" /> Bảng Quản Trị
                  </h3>
                  <p className="text-stone-500 text-xs">Quản lý nội dung và học viên</p>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => setAdminTab('materials')}
                    className={`w-full flex items-center gap-3 py-2.5 px-4 rounded-full text-sm font-bold transition-all text-left ${
                      adminTab === 'materials' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    <BookOpen size={16} /> Thêm tài liệu học tập
                  </button>
                  <button
                    onClick={() => setAdminTab('contests')}
                    className={`w-full flex items-center gap-3 py-2.5 px-4 rounded-full text-sm font-bold transition-all text-left ${
                      adminTab === 'contests' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    <Award size={16} /> Thiết lập cuộc thi
                  </button>
                  <button
                    onClick={() => setAdminTab('users')}
                    className={`w-full flex items-center gap-3 py-2.5 px-4 rounded-full text-sm font-bold transition-all text-left ${
                      adminTab === 'users' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    <Users size={16} /> Quản lý tài khoản
                  </button>
                </div>
              </div>

              {/* Nút đăng xuất của Quản trị viên */}
              <div className="pt-6 mt-6 border-t border-stone-150">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all border border-red-200"
                >
                  <LogOut size={16} /> Đăng xuất quản trị
                </button>
              </div>
            </div>

            {/* Khung nội dung chính của quản trị bên phải */}
            <div className="lg:col-span-3 space-y-6">

              {/* ADMIN TAB 1: THÊM TÀI LIỆU */}
              {adminTab === 'materials' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 md:p-8 shadow-sm">
                    <h3 className="text-lg font-bold text-stone-900 mb-4 pb-2 border-b border-stone-150">
                      Vui lòng chọn hạng mục cần thêm tài liệu.
                    </h3>

                    <form onSubmit={handleAddMaterial} className="space-y-4">
                      {/* Chọn phân loại */}
                      <div>
                        <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Hạng mục tài liệu</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: 'video', label: 'Video tư liệu', icon: VideoIcon },
                            { id: 'book', label: 'Sách', icon: BookOpen },
                            { id: 'story', label: 'Mẫu chuyện', icon: FileText }
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setDocCategory(item.id)}
                              className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all ${
                                docCategory === item.id 
                                  ? 'border-red-600 bg-red-50 text-red-800 font-bold shadow-sm' 
                                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                              }`}
                            >
                              <item.icon size={20} />
                              <span className="text-xs font-bold">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tiêu đề & Đính kèm tệp */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col justify-between">
                          <label className="block text-sm font-medium text-stone-700 mb-1">Tiêu đề tài liệu</label>
                          <input 
                            type="text"
                            required
                            placeholder="Nhập tiêu đề hoặc tên tài liệu"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm"
                          />
                        </div>

                        {/* Thiết lập Đính kèm tệp dung lượng lớn từ thiết bị */}
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Đính kèm tệp từ thiết bị (Hỗ trợ &lt; 100 MB)</label>
                          <div className="border-2 border-dashed border-stone-300 rounded-2xl p-3 text-center hover:border-red-500 transition-colors cursor-pointer relative bg-stone-50/50">
                            <input 
                              type="file" 
                              onChange={handleFileChange}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              accept="video/*,image/*,application/pdf,text/plain"
                            />
                            <div className="flex items-center justify-center gap-2 text-stone-600">
                              <Upload size={16} />
                              <span className="text-xs font-bold">Chọn tệp tin tải lên</span>
                            </div>
                            <p className="text-[10px] text-stone-400 mt-0.5">Video, PDF, Hình ảnh hoặc TXT từ máy tính/điện thoại</p>
                          </div>
                        </div>
                      </div>

                      {/* Trạng thái tệp tin đã đính kèm và Thanh Tiến Trình Tải Lên */}
                      {selectedFileObj && (
                        <div className="p-4 bg-red-50/50 rounded-2xl border border-red-200 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <File size={16} className="text-red-700 shrink-0" />
                              <span className="font-semibold text-stone-700 max-w-[240px] truncate">{selectedFileObj.name}</span>
                              <span className="text-stone-400">({(selectedFileObj.size / (1024 * 1024)).toFixed(2)} MB)</span>
                            </div>
                            {!isUploading && (
                              <button 
                                type="button" 
                                onClick={() => setSelectedFileObj(null)}
                                className="text-red-600 hover:text-red-800 font-bold"
                              >
                                Gỡ bỏ tệp
                              </button>
                            )}
                          </div>

                          {isUploading && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-[11px] font-bold text-red-800">
                                <span className="flex items-center gap-1.5">
                                  <Loader2 size={12} className="animate-spin" />
                                  Đang phân tách và đồng bộ dữ liệu lớn ({uploadProgress}%)...
                                </span>
                              </div>
                              <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-red-600 h-2 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Mô tả ngắn gọn</label>
                        <textarea 
                          rows="2"
                          placeholder="Mô tả tóm tắt nội dung, ý nghĩa lịch sử..."
                          value={docDesc}
                          onChange={(e) => setDocDesc(e.target.value)}
                          className="w-full px-4 py-2 rounded-2xl border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Nội dung chi tiết (Dành cho Sách & Mẫu chuyện nếu không đính kèm tệp)</label>
                        <textarea 
                          rows="4"
                          placeholder="Nhập nội dung văn bản cụ thể..."
                          value={docContent}
                          onChange={(e) => setDocContent(e.target.value)}
                          className="w-full px-4 py-2 rounded-2xl border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUploading}
                        className="w-full bg-stone-900 hover:bg-stone-850 disabled:opacity-50 text-white font-bold py-2.5 rounded-full transition-all flex items-center justify-center gap-1.5 shadow-sm text-sm active:scale-95"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Đang xử lý tệp tin...
                          </>
                        ) : (
                          <>
                            <Plus size={16} /> Thêm tài liệu vào hệ thống
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Lịch sử tải lên */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 text-base mb-4">Lịch sử tài liệu đã đăng tải</h3>
                    
                    {materials.length === 0 ? (
                      <p className="text-stone-400 text-sm italic text-center py-8">Chưa có tài liệu nào trong hệ thống.</p>
                    ) : (
                      <div className="divide-y divide-stone-150">
                        {materials.map((m) => (
                          <div key={m.id} className="py-4 flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                  {m.category === 'video' ? 'Video tư liệu' : m.category === 'book' ? 'Sách' : 'Mẫu chuyện'}
                                </span>
                                <h4 className="font-bold text-stone-950 text-sm">{m.title}</h4>
                              </div>
                              <p className="text-stone-500 text-xs mt-1 line-clamp-2">{m.desc}</p>
                              {m.file && (
                                <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-1">
                                  <File size={12} />
                                  <span>Đính kèm: {m.file.name} ({(m.file.size / (1024 * 1024)).toFixed(2)} MB - {m.file.totalChunks} phân đoạn)</span>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleDeleteMaterial(m)}
                              className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors shrink-0"
                              title="Xóa tài liệu này"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ADMIN TAB 2: TẠO CUỘC THI */}
              {adminTab === 'contests' && (
                <div className="space-y-6">
                  {/* Form Thiết kế Cuộc thi mới */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 md:p-8 shadow-sm">
                    <div className="flex justify-between items-center mb-6 pb-2 border-b border-stone-150">
                      <h3 className="text-lg font-bold text-stone-900">Thiết lập cuộc thi mới</h3>
                      <span className="text-xs bg-amber-150 text-amber-800 font-bold px-3 py-1 rounded-full">
                        Bước {contestStep} / 2
                      </span>
                    </div>

                    {/* Bước 1: Tiêu đề & Mô tả */}
                    {contestStep === 1 && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Tiêu đề cuộc thi</label>
                          <input 
                            type="text"
                            required
                            value={contestTitle}
                            onChange={(e) => setContestTitle(e.target.value)}
                            className="w-full px-4 py-2 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Mô tả cuộc thi</label>
                          <textarea 
                            rows="3"
                            required
                            placeholder="Mô tả mục đích cuộc thi, quy chế học tập..."
                            value={contestDesc}
                            onChange={(e) => setContestDesc(e.target.value)}
                            className="w-full px-4 py-2 rounded-2xl border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm resize-none"
                          />
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!contestTitle.trim() || !contestDesc.trim()) {
                                showAlert("Thiếu thông tin", "Vui lòng nhập đầy đủ tiêu đề và mô tả cuộc thi.");
                                return;
                              }
                              setContestStep(2);
                            }}
                            className="bg-stone-900 hover:bg-stone-850 text-white font-bold py-2.5 px-6 rounded-full transition-all text-sm flex items-center gap-1.5 ml-auto"
                          >
                            Tiếp tục <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bước 2: Thêm câu hỏi */}
                    {contestStep === 2 && (
                      <div className="space-y-6">
                        {/* Soạn câu hỏi */}
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-4">
                          <h4 className="font-bold text-stone-800 text-sm">Thêm câu hỏi trắc nghiệm</h4>
                          
                          <div>
                            <label className="block text-xs font-semibold text-stone-600 mb-1">Nội dung câu hỏi</label>
                            <input 
                              type="text"
                              placeholder="Ví dụ: Bác Hồ đọc bản Tuyên ngôn Độc lập năm nào?"
                              value={qText}
                              onChange={(e) => setQText(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm focus:ring-1 focus:ring-stone-900"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-stone-600 mb-1">Đáp án A</label>
                              <input 
                                type="text"
                                placeholder="Đáp án A"
                                value={qA}
                                onChange={(e) => setQA(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-stone-600 mb-1">Đáp án B</label>
                              <input 
                                type="text"
                                placeholder="Đáp án B"
                                value={qB}
                                onChange={(e) => setQB(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-stone-600 mb-1">Đáp án C</label>
                              <input 
                                type="text"
                                placeholder="Đáp án C"
                                value={qC}
                                onChange={(e) => setQC(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-stone-600 mb-1">Đáp án D</label>
                              <input 
                                type="text"
                                placeholder="Đáp án D"
                                value={qD}
                                onChange={(e) => setQD(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
                              />
                            </div>
                          </div>

                          {/* Chọn đáp án đúng */}
                          <div>
                            <label className="block text-xs font-semibold text-stone-600 mb-2">Đáp án đúng</label>
                            <div className="flex gap-4">
                              {['A', 'B', 'C', 'D'].map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setQCorrect(opt)}
                                  className={`w-10 h-10 rounded-full font-bold transition-all border ${
                                    qCorrect === opt 
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                                      : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleAddQuestion}
                            className="w-full bg-stone-200 hover:bg-stone-300 text-stone-850 font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Plus size={14} /> Thêm vào danh sách câu hỏi
                          </button>
                        </div>

                        {/* Danh sách câu hỏi đã soạn */}
                        <div className="space-y-2">
                          <h4 className="font-bold text-stone-900 text-sm">Câu hỏi đã soạn ({contestQuestions.length})</h4>
                          {contestQuestions.length === 0 ? (
                            <p className="text-stone-400 text-xs italic">Chưa soạn câu hỏi nào cho cuộc thi.</p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto space-y-2 border border-stone-200 rounded-2xl p-3 bg-stone-50">
                              {contestQuestions.map((q, idx) => (
                                <div key={idx} className="bg-white p-3 rounded-xl border border-stone-150 text-xs flex justify-between items-start">
                                  <div>
                                    <p className="font-bold text-stone-850">Câu {idx + 1}: {q.question}</p>
                                    <p className="text-stone-500 mt-1">
                                      Đáp án đúng: <span className="text-emerald-600 font-bold">{q.correct}</span>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...contestQuestions];
                                      updated.splice(idx, 1);
                                      setContestQuestions(updated);
                                    }}
                                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Nút hành động */}
                        <div className="flex justify-between gap-4 pt-2">
                          <button
                            type="button"
                            onClick={() => setContestStep(1)}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2.5 px-6 rounded-full transition-all text-sm"
                          >
                            Quay lại bước 1
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveContest}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-full transition-all text-sm"
                          >
                            Xong & Đăng tải cuộc thi
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quản lý các cuộc thi hiện có */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 text-base mb-4">Các cuộc thi hiện có</h3>
                    {contests.length === 0 ? (
                      <p className="text-stone-400 text-sm italic text-center py-8">Chưa có cuộc thi nào được tạo.</p>
                    ) : (
                      <div className="space-y-4">
                        {contests.map((item) => (
                          <div key={item.id} className="p-4 rounded-2xl border border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-stone-900 text-sm">{item.title}</h4>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  item.status === 'ended' ? 'bg-stone-100 text-stone-600' : 'bg-red-50 text-red-700'
                                }`}>
                                  {item.status === 'ended' ? 'Đã kết thúc' : 'Đang hoạt động'}
                                </span>
                              </div>
                              <p className="text-stone-500 text-xs mt-1">{item.desc}</p>
                              <span className="text-[10px] text-stone-400 mt-2 block">
                                Tổng cộng {item.questions?.length || 0} câu hỏi
                              </span>
                            </div>

                            <div className="flex gap-2 shrink-0">
                              {item.status !== 'ended' && (
                                <button
                                  onClick={() => handleEndContest(item)}
                                  className="bg-amber-50 hover:bg-amber-150 text-amber-700 text-xs font-bold py-2 px-3 rounded-full transition-colors flex items-center gap-1"
                                >
                                  <Lock size={12} /> Kết thúc cuộc thi
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteContest(item)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2 px-3 rounded-full transition-colors flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Xóa cuộc thi
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Danh sách báo cáo tổng kết cuộc thi đã kết thúc */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 text-base mb-4 flex items-center gap-2">
                      <BarChart2 size={18} className="text-emerald-600" /> Báo cáo tổng kết cuộc thi đã kết thúc
                    </h3>
                    
                    {reports.length === 0 ? (
                      <p className="text-stone-400 text-sm italic text-center py-8">Chưa có báo cáo nào được ghi nhận.</p>
                    ) : (
                      <div className="space-y-6">
                        {reports.map((rep) => (
                          <div key={rep.id} className="p-4 rounded-2xl border border-stone-150 bg-stone-50 space-y-3">
                            <div className="flex justify-between items-start border-b border-stone-200 pb-2">
                              <div>
                                <h4 className="font-bold text-stone-900 text-sm">Báo cáo: {rep.contestTitle}</h4>
                                <span className="text-[10px] text-stone-400">
                                  Thời gian lập: {new Date(rep.endedAt).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-stone-200 text-stone-500 uppercase font-bold text-[10px]">
                                    <th className="py-2">Họ & Tên</th>
                                    <th className="py-2">Tên tài khoản</th>
                                    <th className="py-2">Số câu Đúng</th>
                                    <th className="py-2">Số câu Sai</th>
                                    <th className="py-2 text-right">Xu tích lũy (Bảo lưu)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-150">
                                  {rep.participants && rep.participants.length > 0 ? (
                                    rep.participants.map((p, idx) => (
                                      <tr key={idx} className="text-stone-700">
                                        <td className="py-2 font-medium">{p.fullName}</td>
                                        <td className="py-2">@{p.username}</td>
                                        <td className="py-2 text-emerald-600 font-bold">{p.correct}</td>
                                        <td className="py-2 text-red-500 font-bold">{p.wrong}</td>
                                        <td className="py-2 text-right font-bold text-amber-600">{p.goldCoins} xu</td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan="5" className="py-4 text-center text-stone-400 italic">
                                        Không có dữ liệu người tham gia cuộc thi này.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ADMIN TAB 3: QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG */}
              {adminTab === 'users' && (
                <div className="space-y-6">
                  {/* Form tạo tài khoản người dùng */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 md:p-8 shadow-sm">
                    <h3 className="text-lg font-bold text-stone-900 mb-4 pb-2 border-b border-stone-150">
                      Tạo tài khoản người dùng mới
                    </h3>

                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Họ và Tên</label>
                          <input 
                            type="text"
                            required
                            placeholder="Nguyễn Văn A"
                            value={newUserFullName}
                            onChange={(e) => setNewUserFullName(e.target.value)}
                            className="w-full px-4 py-2 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Tên đăng nhập (Username)</label>
                          <input 
                            type="text"
                            required
                            placeholder="nguyenvana"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-4 py-2 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Mật khẩu</label>
                          <input 
                            type="password"
                            required
                            placeholder="Nhập mật khẩu tài khoản"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-full border border-stone-300 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none text-sm"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-stone-900 hover:bg-stone-850 text-white font-bold py-2.5 rounded-full transition-colors flex items-center justify-center gap-1.5 shadow-sm text-sm"
                      >
                        <Plus size={16} /> Tạo tài khoản người dùng
                      </button>
                    </form>
                  </div>

                  {/* Danh sách người dùng hiện có */}
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
                    <h3 className="font-bold text-stone-900 text-base mb-4">Danh sách tài khoản trong hệ thống</h3>
                    
                    {dbUsers.length === 0 ? (
                      <p className="text-stone-400 text-sm italic text-center py-8">
                        Chưa có tài khoản người dùng nào được tạo. Toàn bộ tài khoản phải do quản trị viên tạo thủ công.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-stone-200 text-stone-500 uppercase font-bold text-[11px] tracking-wider">
                              <th className="py-3 px-4">Họ và Tên</th>
                              <th className="py-3 px-4">Tên người dùng</th>
                              <th className="py-3 px-4">Mật khẩu lưu trữ</th>
                              <th className="py-3 px-4">Số xu tích lũy</th>
                              <th className="py-3 px-4 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-150">
                            {dbUsers.map((item) => (
                              <tr key={item.id} className="hover:bg-stone-50 text-stone-700">
                                <td className="py-3 px-4 font-bold text-stone-900">{item.fullName}</td>
                                <td className="py-3 px-4">@{item.username}</td>
                                <td className="py-3 px-4 text-stone-400 font-mono">●●●●●●</td>
                                <td className="py-3 px-4 font-bold text-amber-600">{item.goldCoins ?? 0} xu</td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleDeleteUser(item.id, item.fullName)}
                                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
                                    title="Xóa tài khoản này"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* --- MODAL DIALOGS --- */}
      {modalConfig.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-100 transform scale-100 transition-all">
            <h3 className="font-extrabold text-stone-900 text-lg mb-2">{modalConfig.title}</h3>
            <p className="text-stone-600 text-sm mb-6 leading-relaxed">{modalConfig.message}</p>
            
            <div className="flex justify-end gap-3">
              {modalConfig.onConfirm ? (
                <>
                  <button
                    onClick={() => setModalConfig({ show: false, title: '', message: '', onConfirm: null })}
                    className="px-5 py-2 rounded-full border border-stone-300 text-stone-700 hover:bg-stone-100 text-sm font-semibold transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => {
                      modalConfig.onConfirm();
                      setModalConfig({ show: false, title: '', message: '', onConfirm: null });
                    }}
                    className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-md active:scale-95"
                  >
                    Đồng ý
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setModalConfig({ show: false, title: '', message: '', onConfirm: null })}
                  className="px-6 py-2.5 rounded-full bg-stone-900 hover:bg-stone-850 text-white text-sm font-bold transition-colors w-full md:w-auto"
                >
                  Xác nhận
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL TRÌNH PHÁT / TRÌNH XEM TỆP DUNG LƯỢNG LỚN TRỰC TUYẾN --- */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-stone-200 mb-4">
              <h3 className="font-bold text-stone-900 text-base md:text-lg truncate max-w-[80%]">
                Đang xem: {previewMedia.title}
              </h3>
              <button 
                onClick={() => {
                  URL.revokeObjectURL(previewMedia.blobUrl);
                  setPreviewMedia(null);
                }}
                className="p-1.5 hover:bg-stone-100 rounded-full text-stone-500 hover:text-stone-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex items-center justify-center bg-stone-950 rounded-2xl min-h-[350px] p-2">
              {previewMedia.type.startsWith('video/') ? (
                <video 
                  src={previewMedia.blobUrl} 
                  controls 
                  className="max-h-[60vh] max-w-full rounded-xl"
                  autoPlay
                />
              ) : previewMedia.type.startsWith('image/') ? (
                <img 
                  src={previewMedia.blobUrl} 
                  alt={previewMedia.title}
                  className="max-h-[60vh] max-w-full object-contain rounded-xl"
                />
              ) : previewMedia.type.includes('pdf') ? (
                <iframe 
                  src={previewMedia.blobUrl} 
                  className="w-full h-[55vh] rounded-xl"
                  title="PDF Viewer"
                />
              ) : (
                <div className="text-center text-white p-6">
                  <File size={48} className="mx-auto mb-3 text-red-500" />
                  <p className="text-sm font-semibold">Đã tải tệp lên trình duyệt thành công ({previewMedia.name})</p>
                  <p className="text-xs text-stone-400 mt-1">Trình duyệt không hỗ trợ mở định dạng này trực tiếp. Vui lòng tải xuống thiết bị.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200 mt-4">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = previewMedia.blobUrl;
                  link.download = previewMedia.name;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-4 rounded-full flex items-center gap-1 transition-colors"
              >
                <Download size={14} /> Tải về máy
              </button>
              <button
                onClick={() => {
                  URL.revokeObjectURL(previewMedia.blobUrl);
                  setPreviewMedia(null);
                }}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold py-2 px-4 rounded-full transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FOOTER --- */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-8 mt-12 border-t border-stone-850">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-2">
          <p className="font-bold text-stone-300">© 2026 Không gian Văn hóa Hồ Chí Minh trực tuyến</p>
          <p className="text-yellow-400 font-mono mb-2">Cổng thông tin chính thức: https://khonggianvanhoahcm.vn</p>
          <p className="max-w-xl mx-auto leading-relaxed">
            Học tập tư tưởng, đạo đức, phong cách Hồ Chí Minh. Hệ thống quản trị hỗ trợ đăng tải tài liệu học tập, sách, mẫu chuyện cách mạng và tổ chức các đợt thi tìm hiểu lịch sử trực quan sinh động.
          </p>
        </div>
      </footer>
    </div>
  );
}