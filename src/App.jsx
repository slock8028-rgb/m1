


import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Sparkles, Gift, Wand2, History, CreditCard, 
  ChevronRight, CheckCircle2, AlertCircle, Download, Share2, Loader2, Home, 
  LogOut, User, Coins
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp 
} from 'firebase/firestore';

// --- Firebase 初始化 ---
const firebaseConfig = { 
  apiKey: "AIzaSyDF_GuKWmk8iCiztIXqBw242e8bmXHaDmE", 
  authDomain: "blessingcardai.firebaseapp.com", 
  projectId: "blessingcardai", 
  storageBucket: "blessingcardai.firebasestorage.app", 
  messagingSenderId: "1081489694882", 
  appId: "1:1081489694882:web:57e833a8c0f5151e7d77fb" 
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'blessing-card-ai';

// --- 常數設定 ---
const API_KEY = "AIzaSyA3csaPKlpK1kgGIq2vqUMz1IzKEYwP3GQ";
const POINTS_NEW_USER = 20;
const POINTS_PER_GEN = 10;

const FESTIVALS = ['生日', '聖誕節', '新一年', '農曆新年', '復活節', '萬聖節', '畢業', 'BB出世', '退休', '結婚', '紀念日'];
const DECORATIONS_MAP = {
  '生日': ['氣球', '生日蛋糕', '彩帶', '派對帽'],
  '聖誕節': ['雪花', '聖誕帽', '聖誕樹', '禮物盒', '馴鹿'],
  '農曆新年': ['燈籠', '紅包', '煙花', '桃花', '福字'],
  '預設': ['星星閃爍', '愛心', '花朵', '光暈', '彩紙']
};

const STYLES_ROLEPLAY = [
  '迪士尼3D動畫風', '日系吉卜力風', '歐美漫畫英雄', '皇家貴族油畫', '賽博龐克(Cyberpunk)', 
  '中世紀騎士/公主', '太空宇航員', '魔法學院學生', '復古像素藝術(Pixel)', '黏土人偶(Claymation)'
];
const STYLES_ART = [
  '溫暖水彩畫(Watercolor)', '精緻色鉛筆(Colored Pencil)', '印象派油畫', '極簡線條藝術', '夢幻童話繪本', 
  '3D 渲染立體風', '復古拍立得相片', '剪紙藝術(Papercut)', '霓虹燈管藝術', '彩色玻璃窗(Stained Glass)'
];

const STRIPE_PUBLIC_KEY = "pk_live_51TPxre6hUbHNbFqhPNKApgieuIgNnvZHn79b753wbLzsqXpQm0zDo6veJ2x2ehKwgzTDRv1SMCiSqDNcmAMVfmd400yvfQ7P6u";

const PRICING_PLANS = [
  { id: 'basic', name: '入門方案', points: 80, price: 16, desc: '可生成 8 張賀咭' },
  { id: 'value', name: '超值方案', points: 300, price: 56, desc: '可生成 30 張賀咭', popular: true },
  { id: 'pro', name: '專業方案', points: 600, price: 96, desc: '可生成 60 張賀咭' }
];

// --- 輔助工具函式 ---
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * 將 Base64 圖片壓縮至 1MB 以下，以符合 Firestore 限制
 */
const compressImage = async (base64Str, maxWidth = 800, quality = 0.6) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
};

const callGeminiImageAPI = async (prompt, base64Image) => {
  try {
    // Pollinations.ai uses a URL-based generation approach.
    // We'll encode the prompt and request a high-quality image.
    const encodedPrompt = encodeURIComponent(prompt + " high quality, cinematic lighting, masterpiece, 4k");
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true`;
    
    // To ensure the image is fully loaded before returning
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    // Convert the URL to Base64 so the rest of the app's 
    // compression and Firestore storage logic still works.
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    throw new Error(`Image Generation Error: ${err.message}`);
  }
};

// --- 主應用程式組件 ---
export default function App() {

  
  
  

  const [user, setUser] = useState(null);
  const [userPoints, setUserPoints] = useState(0);
  const [currentPage, setCurrentPage] = useState('home'); // home, create, dashboard, history, pricing
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // PWA 設定
  useEffect(() => {
    const manifest = {
      name: "BlessingCardAI",
      short_name: "BlessingCard",
      start_url: ".",
      display: "standalone",
      background_color: "#F5F0E6",
      theme_color: "#F5F0E6",
      icons: [{ src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='192' height='192'><rect width='192' height='192' fill='%238B5A2B'/><text x='50%' y='50%' font-size='80' text-anchor='middle' dy='.3em' fill='%23F5F0E6'>B</text></svg>", sizes: "192x192", type: "image/svg+xml" }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestURL = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = manifestURL;
  }, []);

  // Firebase 驗證
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("驗證初始化失敗:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // 獲取用戶點數
  useEffect(() => {
    if (!user) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    
    const checkInitProfile = async () => {
      const docSnap = await getDoc(profileRef);
      if (!docSnap.exists()) {
        await setDoc(profileRef, { points: POINTS_NEW_USER, createdAt: serverTimestamp() });
      }
    };
    checkInitProfile();

    const unsubscribe = onSnapshot(profileRef, (doc) => {
      if (doc.exists()) {
        setUserPoints(doc.data().points || 0);
      }
    }, (err) => console.error("點數監聽失敗:", err));

    return () => unsubscribe();
  }, [user]);

  const updatePoints = async (changeAmount) => {
    if (!user) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    await setDoc(profileRef, { points: userPoints + changeAmount }, { merge: true });
  };

  if (isLoadingAuth) {
    return <div className="min-h-screen bg-[#F5F0E6] flex items-center justify-center text-[#5C4033]"><Loader2 className="animate-spin w-10 h-10" />
  {showAlipayModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-blue-600 p-6 text-white text-center">
          <h3 className="text-2xl font-bold">AlipayHK 支付</h3>
          <p className="text-blue-100 text-sm mt-1">請掃描下方二維碼完成付款</p>
        </div>
        
        <div className="p-8 flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl shadow-inner border-4 border-blue-50 mb-6">
            <img src="/alipay-qr.jpg" alt="Alipay QR" className="w-64 h-64 object-contain" />
          </div>
          
          <div className="w-full space-y-4">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-blue-800 text-sm font-medium text-center">
                付款金額: <span className="text-lg font-bold">HK${selectedPlan?.price}</span>
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 text-center">付款後請上傳截圖證明</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setUploadingProof(true);
                  try {
                    // Upload to Firebase Storage
                    const storageRef = ref(storage, `payment_proofs/${user.uid}_${Date.now()}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    
                    // Save request to Firestore
                    await addDoc(collection(db, "payment_requests"), {
                      userId: user.uid,
                      planId: selectedPlan.name,
                      points: selectedPlan.points,
                      proofUrl: url,
                      status: "pending",
                      timestamp: serverTimestamp()
                    });
                    
                    alert("付款證明已提交！管理員核實後將為您增加點數。");
                    setShowAlipayModal(false);
                  } catch (err) {
                    alert("上傳失敗，請稍後再試");
                  } finally {
                    setUploadingProof(false);
                  }
                }}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 text-center">
          <button 
            onClick={() => setShowAlipayModal(false)}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  )}

</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F0E6] text-[#5C4033] font-sans selection:bg-[#8B5A2B] selection:text-[#F5F0E6]">
      {/* 導航欄 */}
      <nav className="sticky top-0 z-50 bg-[#F5F0E6]/80 backdrop-blur-md border-b border-[#E6DFD3] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center cursor-pointer" onClick={() => setCurrentPage('home')}>
              <Sparkles className="w-6 h-6 text-[#8B5A2B] mr-2" />
              <span className="font-bold text-xl tracking-tight text-[#5C4033]">BlessingCard<span className="text-[#8B5A2B]">AI</span></span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {user && (
                <>
                  <button onClick={() => setCurrentPage('pricing')} className="flex items-center space-x-1 bg-white/50 px-3 py-1.5 rounded-full border border-[#E6DFD3] hover:bg-white transition">
                    <Coins className="w-4 h-4 text-yellow-600" />
                    <span className="font-semibold text-sm">{userPoints} 點</span>
                  </button>
                  <div className="hidden sm:flex items-center space-x-4">
                    <button onClick={() => setCurrentPage('create')} className="text-sm font-medium hover:text-[#8B5A2B] transition">製作賀咭</button>
                    <button onClick={() => setCurrentPage('history')} className="text-sm font-medium hover:text-[#8B5A2B] transition">歷史記錄</button>
                  </div>
                  <button onClick={() => setCurrentPage('dashboard')} className="p-2 bg-[#8B5A2B] text-white rounded-full hover:bg-[#724a23] transition">
                    <User className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 主要內容區 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
        {currentPage === 'dashboard' && <Dashboard user={user} points={userPoints} onNavigate={setCurrentPage} />}
        {currentPage === 'create' && <CreateCardPage user={user} points={userPoints} updatePoints={updatePoints} onNavigate={setCurrentPage} />}
        {currentPage === 'history' && <HistoryPage user={user} />}
        {currentPage === 'pricing' && <PricingPage updatePoints={updatePoints} onNavigate={setCurrentPage} />}
      </main>
    </div>
  );
}

// --- 頁面組件 ---

function HomePage({ onNavigate }) {
  return (
    <div className="flex flex-col items-center text-center space-y-12 animate-in fade-in duration-500">
      <div className="max-w-3xl space-y-6 pt-10">
        <h1 className="text-4xl sm:text-6xl font-extrabold text-[#5C4033] leading-tight">
          用 AI 傳遞 <br/><span className="text-[#8B5A2B] relative inline-block">專屬您的溫暖祝福<svg className="absolute -bottom-2 w-full h-3 text-[#E6DFD3]" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="4" fill="transparent"/></svg></span>
        </h1>
        <p className="text-lg text-[#7A6352] max-w-2xl mx-auto">
          上傳照片，選擇節日與風格，AI 為您瞬間生成獨一無二的賀咭。
          新註冊即送 20 點，免費體驗兩次奇妙的創作旅程！
        </p>
        <div className="flex justify-center pt-4">
          <button onClick={() => onNavigate('create')} className="bg-[#8B5A2B] hover:bg-[#724a23] text-white px-8 py-4 rounded-full text-lg font-bold shadow-lg shadow-[#8B5A2B]/30 transition transform hover:-translate-y-1 flex items-center">
            <Wand2 className="w-5 h-5 mr-2" />
            開始製作賀咭
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full max-w-5xl mt-12">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E6DFD3] flex flex-col items-center">
          <div className="w-16 h-16 bg-[#F5F0E6] rounded-full flex items-center justify-center mb-4"><ImageIcon className="w-8 h-8 text-[#8B5A2B]" /></div>
          <h3 className="text-xl font-bold mb-2">1. 上傳相片</h3>
          <p className="text-[#7A6352] text-sm">支援個人照或合照，AI 將完美保留人物特徵。</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E6DFD3] flex flex-col items-center">
          <div className="w-16 h-16 bg-[#F5F0E6] rounded-full flex items-center justify-center mb-4"><Sparkles className="w-8 h-8 text-[#8B5A2B]" /></div>
          <h3 className="text-xl font-bold mb-2">2. 選擇風格</h3>
          <p className="text-[#7A6352] text-sm">從角色變身到藝術插畫，超過40種豐富風格任您挑選。</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E6DFD3] flex flex-col items-center">
          <div className="w-16 h-16 bg-[#F5F0E6] rounded-full flex items-center justify-center mb-4"><Gift className="w-8 h-8 text-[#8B5A2B]" /></div>
          <h3 className="text-xl font-bold mb-2">3. 傳遞祝福</h3>
          <p className="text-[#7A6352] text-sm">一鍵下載或分享，將最溫暖的心意送到親友手中。</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, points, onNavigate }) {
  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in">
      <h2 className="text-3xl font-bold">儀表板</h2>
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-[#E6DFD3] flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <p className="text-sm text-[#7A6352] font-medium">目前剩餘點數</p>
          <div className="flex items-baseline mt-2">
            <span className="text-5xl font-black text-[#8B5A2B]">{points}</span>
            <span className="text-lg ml-2 text-[#7A6352]">點</span>
          </div>
          <p className="text-xs text-[#7A6352] mt-2">每次生成消耗 10 點</p>
        </div>
        <div className="flex flex-col space-y-3 w-full sm:w-auto">
          <button onClick={() => onNavigate('create')} className="bg-[#8B5A2B] text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-[#724a23] transition flex items-center justify-center">
            <Wand2 className="w-4 h-4 mr-2" /> 前往製作
          </button>
          <button onClick={() => onNavigate('pricing')} className="bg-[#F5F0E6] text-[#8B5A2B] border border-[#8B5A2B]/30 px-6 py-3 rounded-xl font-bold hover:bg-[#E6DFD3] transition flex items-center justify-center">
            <CreditCard className="w-4 h-4 mr-2" /> 購買點數
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onNavigate('history')} className="bg-white p-6 rounded-2xl shadow-sm border border-[#E6DFD3] hover:border-[#8B5A2B] transition flex flex-col items-center text-center group">
          <History className="w-8 h-8 text-[#8B5A2B] mb-3 group-hover:scale-110 transition-transform" />
          <span className="font-bold">歷史記錄</span>
          <span className="text-xs text-[#7A6352] mt-1">查看過往作品</span>
        </button>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#E6DFD3] flex flex-col items-center text-center justify-center">
           <span className="text-xs text-[#7A6352]">用戶 ID: {user?.uid?.slice(0,8)}...</span>
        </div>
      </div>
    </div>
  );
}

function CreateCardPage({ user, points, updatePoints, onNavigate }) {
  const [image, setImage] = useState(null); 
  const [imagePreview, setImagePreview] = useState(null);
  const [festival, setFestival] = useState('聖誕節');
  const [customFestival, setCustomFestival] = useState('');
  const [styleType, setStyleType] = useState('roleplay'); 
  const [styleName, setStyleName] = useState(STYLES_ROLEPLAY[0]);
  const [decorations, setDecorations] = useState([]);
  const [message, setMessage] = useState('');
  const [extraDetails, setExtraDetails] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 9 * 1024 * 1024) {
      setErrorMsg('圖片大小不能超過 9MB');
      return;
    }
    setErrorMsg('');
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const currentDecorationsList = DECORATIONS_MAP[festival] || DECORATIONS_MAP['預設'];

  const handleGenerate = async () => {
    if (!image) {
      setErrorMsg('請先上傳一張相片');
      return;
    }
    if (points < POINTS_PER_GEN) {
      setErrorMsg('點數不足，請先購買點數');
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');
    setResultImage(null);

    try {
      const actualFestival = festival === '其他' ? customFestival : festival;
      const decorsText = decorations.length > 0 ? decorations.join(', ') : 'None';
      
      let stylePrefix = "";
      if (styleType === 'roleplay') {
        stylePrefix = "Keep the face identical, but transform the character into: ";
      } else {
        stylePrefix = "Transform the overall style of the image into: ";
      }

      const prompt = `
        Task: Create a beautiful greeting card image based on the provided photo.
        ${stylePrefix} ${styleName}.
        Festival Context: ${actualFestival}.
        Add these decorations naturally into the scene: ${decorsText}.
        Vibe: Warm, festive, personalized, high quality, masterpiece.
        ${extraDetails ? `Extra instructions: ${extraDetails}` : ''}
        Generate an elegant image without any text/words on the image itself.
      `;

      const generatedImageUrl = await callGeminiImageAPI(prompt, image);

      // --- 解決 Firebase 限制：儲存前壓縮圖片 ---
      const compressedImageForStorage = await compressImage(generatedImageUrl, 800, 0.6);

      //扣點
      await updatePoints(-POINTS_PER_GEN);

      // 儲存至 Firestore
      const genRef = collection(db, 'artifacts', appId, 'users', user.uid, 'generations');
      await addDoc(genRef, {
        status: 'success',
        imageUrl: compressedImageForStorage,
        cost: POINTS_PER_GEN,
        promptData: {
          festival: actualFestival,
          styleType,
          styleName,
          decorations,
          message,
          extra: extraDetails
        },
        createdAt: serverTimestamp()
      });

      setResultImage(generatedImageUrl);
    } catch (err) {
      console.error(err);
      setErrorMsg(`生成失敗: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `BlessingCard_${Date.now()}.png`;
    a.click();
  };

  const handleShare = async () => {
    if (!resultImage) return;
    if (navigator.share) {
      try {
        const res = await fetch(resultImage);
        const blob = await res.blob();
        const file = new File([blob], 'blessing_card.png', { type: 'image/png' });
        await navigator.share({
          title: '我的專屬賀咭',
          text: message || '來看看我用 AI 製作的賀咭！',
          files: [file]
        });
      } catch (err) {
        console.log('分享失敗:', err);
      }
    } else {
      alert("您的瀏覽器不支援分享功能。");
    }
  };

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in">
      <div className="lg:col-span-7 space-y-8 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-[#E6DFD3]">
        <h2 className="text-2xl font-bold border-b border-[#E6DFD3] pb-4">製作您的專屬賀咭</h2>
        
        <div className="space-y-3">
          <label className="font-bold text-lg flex items-center"><span className="bg-[#8B5A2B] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">1</span>上傳相片</label>
          <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#8B5A2B]/40 rounded-2xl p-8 text-center cursor-pointer hover:bg-[#F5F0E6]/50 transition group overflow-hidden relative min-h-[200px] flex items-center justify-center">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition" />
            ) : null}
            <div className="relative z-10 flex flex-col items-center">
              <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                <Upload className="w-6 h-6 text-[#8B5A2B]" />
              </div>
              <p className="font-medium text-[#5C4033]">{imagePreview ? '點擊重新上傳' : '點擊上傳圖片'}</p>
              <p className="text-xs text-[#7A6352] mt-1">支援 JPG/PNG，最大 9MB</p>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>
        </div>

        <div className="space-y-3">
          <label className="font-bold text-lg flex items-center"><span className="bg-[#8B5A2B] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">2</span>選擇節日/場合</label>
          <div className="flex flex-wrap gap-2">
            {FESTIVALS.map(f => (
              <button key={f} onClick={() => { setFestival(f); setDecorations([]); }} className={`px-4 py-2 rounded-full text-sm font-medium border transition ${festival === f ? 'bg-[#8B5A2B] text-white border-[#8B5A2B]' : 'bg-white text-[#7A6352] border-[#E6DFD3] hover:border-[#8B5A2B]'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="font-bold text-lg flex items-center"><span className="bg-[#8B5A2B] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">3</span>選擇風格</label>
          <div className="flex bg-[#F5F0E6] p-1 rounded-xl w-full max-w-sm mb-4">
            <button onClick={() => { setStyleType('roleplay'); setStyleName(STYLES_ROLEPLAY[0]); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${styleType === 'roleplay' ? 'bg-white shadow-sm text-[#8B5A2B]' : 'text-[#7A6352] hover:text-[#5C4033]'}`}>
              角色變身
            </button>
            <button onClick={() => { setStyleType('art'); setStyleName(STYLES_ART[0]); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${styleType === 'art' ? 'bg-white shadow-sm text-[#8B5A2B]' : 'text-[#7A6352] hover:text-[#5C4033]'}`}>
              藝術插畫
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(styleType === 'roleplay' ? STYLES_ROLEPLAY : STYLES_ART).map(style => (
              <button key={style} onClick={() => setStyleName(style)} className={`p-3 rounded-xl text-xs sm:text-sm text-left border transition ${styleName === style ? 'border-[#8B5A2B] bg-[#F5F0E6] font-bold' : 'border-[#E6DFD3] hover:border-[#8B5A2B]/50'}`}>
                {style}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="font-bold text-lg flex items-center"><span className="bg-[#8B5A2B] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">4</span>加入裝飾</label>
          <div className="flex flex-wrap gap-2">
            {currentDecorationsList.map(decor => (
              <label key={decor} className={`flex items-center space-x-2 px-3 py-2 rounded-lg border cursor-pointer transition ${decorations.includes(decor) ? 'bg-[#F5F0E6] border-[#8B5A2B]' : 'border-[#E6DFD3]'}`}>
                <input type="checkbox" checked={decorations.includes(decor)} onChange={(e) => {
                  if (e.target.checked) setDecorations([...decorations, decor]);
                  else setDecorations(decorations.filter(d => d !== decor));
                }} className="rounded text-[#8B5A2B]" />
                <span className="text-sm font-medium">{decor}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-[#E6DFD3]">
          <div>
            <label className="font-bold text-sm text-[#7A6352] mb-1 block">祝福語</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows="2" placeholder="例如：祝你生日快樂！" className="w-full p-3 rounded-xl border border-[#E6DFD3] focus:ring-2 focus:ring-[#8B5A2B]/50 resize-none"></textarea>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start text-sm">
            <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
            {errorMsg}
          </div>
        )}
      </div>

      <div className="lg:col-span-5 relative">
        <div className="sticky top-24 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#E6DFD3] text-center">
            {resultImage ? (
              <div className="space-y-6 animate-in zoom-in-95">
                <div className="flex items-center justify-center text-green-600 font-bold mb-2">
                  <CheckCircle2 className="w-5 h-5 mr-1" /> 生成成功！
                </div>
                <div className="relative rounded-2xl overflow-hidden border-4 border-[#F5F0E6] shadow-inner group">
                  <img src={resultImage} alt="Generated" className="w-full h-auto object-cover" />
                  {message && (
                    <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                       <p className="text-white font-bold text-lg">{message}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={handleDownload} className="flex-1 bg-[#8B5A2B] text-white py-3 rounded-xl font-bold hover:bg-[#724a23] transition flex items-center justify-center">
                    <Download className="w-4 h-4 mr-2" /> 下載
                  </button>
                  <button onClick={handleShare} className="flex-1 bg-[#F5F0E6] text-[#8B5A2B] py-3 rounded-xl font-bold hover:bg-[#E6DFD3] transition flex items-center justify-center">
                    <Share2 className="w-4 h-4 mr-2" /> 分享
                  </button>
                </div>
              </div>
            ) : isGenerating ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-[#8B5A2B] animate-spin" />
                <h3 className="text-xl font-bold">AI 製作中...</h3>
                <p className="text-sm text-[#7A6352]">正在壓縮與優化圖片存檔</p>
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center justify-center space-y-4 text-[#7A6352]">
                <Sparkles className="w-12 h-12 text-[#E6DFD3]" />
                <p>設定完成後，點擊下方生成</p>
              </div>
            )}
            
            {!resultImage && !isGenerating && (
              <div className="mt-8 border-t border-[#E6DFD3] pt-6">
                <button onClick={handleGenerate} disabled={!image} className={`w-full py-4 rounded-xl text-lg font-bold shadow-md transition ${!image ? 'bg-[#E6DFD3] text-[#A89F91]' : 'bg-[#8B5A2B] text-white hover:bg-[#724a23]'}`}>
                  <Wand2 className="w-5 h-5 mr-2 inline" />
                  生成賀咭 (10 點)
                </button>
                <p className="text-xs text-[#7A6352] mt-3">目前點數：{points}</p>
              </div>
            )}
            {resultImage && <button onClick={() => setResultImage(null)} className="mt-6 text-sm text-[#8B5A2B] font-bold">製作下一張</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPage({ user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const genRef = collection(db, 'artifacts', appId, 'users', user.uid, 'generations');
    const q = query(genRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
      setHistory(docs);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  if (loading) return <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#8B5A2B]" /></div>;

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in">
      <h2 className="text-3xl font-bold mb-8 flex items-center"><History className="mr-3 text-[#8B5A2B]" /> 歷史記錄</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {history.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden group">
            <div className="aspect-square relative overflow-hidden bg-[#F5F0E6]">
              <img src={item.imageUrl} alt="History" className="w-full h-full object-cover" />
            </div>
            <div className="p-4">
              <div className="flex justify-between text-xs text-[#A89F91] mb-2">
                <span className="bg-[#F5F0E6] text-[#8B5A2B] px-2 py-0.5 rounded font-bold">{item.promptData?.festival}</span>
                <span>{item.createdAt?.toDate().toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-bold truncate">{item.promptData?.styleName}</p>
              {item.promptData?.message && <p className="text-xs text-[#7A6352] truncate mt-1">"{item.promptData.message}"</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingPage({ updatePoints, onNavigate }) {
  
  
  
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const confirmStripePurchase = async () => {
    setIsProcessing(true);
    await delay(1000);
    await updatePoints(selectedPlan.points);
    setIsProcessing(false);
    setShowMockModal(false);
    alert(`成功儲值 ${selectedPlan.points} 點！`);
    onNavigate('dashboard');
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-2">購買點數</h2>
        <p className="text-[#7A6352]">選擇方案繼續創作。</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {PRICING_PLANS.map(plan => (
          <div key={plan.id} className={`bg-white rounded-3xl p-8 border-2 ${plan.popular ? 'border-[#8B5A2B] shadow-lg' : 'border-[#E6DFD3]'}`}>
            <h3 className="text-xl font-bold mb-4">{plan.name}</h3>
            <div className="text-4xl font-black mb-6">HK${plan.price}</div>
            <div className="bg-[#F5F0E6] p-4 rounded-xl mb-6 text-center">
              <span className="block text-2xl font-bold text-[#8B5A2B]">{plan.points} 點</span>
            </div>
            <button onClick={() => { setSelectedPlan(plan); setShowMockModal(true); }} className={`w-full py-3 rounded-xl font-bold ${plan.popular ? 'bg-[#8B5A2B] text-white' : 'bg-[#F5F0E6] text-[#8B5A2B]'}`}>
              購買
            </button>
          </div>
        ))}
      </div>
     
  {showAlipayModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-blue-600 p-6 text-white text-center">
          <h3 className="text-2xl font-bold">AlipayHK 支付</h3>
          <p className="text-blue-100 text-sm mt-1">請掃描下方二維碼完成付款</p>
        </div>
        
        <div className="p-8 flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl shadow-inner border-4 border-blue-50 mb-6">
            <img src="/alipay-qr.jpg" alt="Alipay QR" className="w-64 h-64 object-contain" />
          </div>
          
          <div className="w-full space-y-4">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-blue-800 text-sm font-medium text-center">
                付款金額: <span className="text-lg font-bold">HK${selectedPlan?.price}</span>
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 text-center">付款後請上傳截圖證明</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setUploadingProof(true);
                  try {
                    // Upload to Firebase Storage
                    const storageRef = ref(storage, `payment_proofs/${user.uid}_${Date.now()}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    
                    // Save request to Firestore
                    await addDoc(collection(db, "payment_requests"), {
                      userId: user.uid,
                      planId: selectedPlan.name,
                      points: selectedPlan.points,
                      proofUrl: url,
                      status: "pending",
                      timestamp: serverTimestamp()
                    });
                    
                    alert("付款證明已提交！管理員核實後將為您增加點數。");
                    setShowAlipayModal(false);
                  } catch (err) {
                    alert("上傳失敗，請稍後再試");
                  } finally {
                    setUploadingProof(false);
                  }
                }}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 text-center">
          <button 
            onClick={() => setShowAlipayModal(false)}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  )}

  {showMockModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-4">Stripe 安全支付</h3>
            <p className="text-sm text-gray-500 mb-6">您正在購買 {selectedPlan.name} (HK${selectedPlan.price})</p>
            <button onClick={confirmStripePurchase} className="w-full bg-[#635BFF] text-white py-3 rounded-xl font-bold">
              {isProcessing ? <Loader2 className="animate-spin mx-auto" /> : "立即前往付款"}
            </button>
            <button onClick={() => setShowMockModal(false)} className="w-full mt-4 text-gray-400">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}// Triggering fresh build
