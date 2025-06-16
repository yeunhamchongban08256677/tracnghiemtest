document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileUploadInput = document.getElementById('file-upload-input');
    const uploadStatus = document.getElementById('upload-status');
    const customQuizActions = document.getElementById('custom-quiz-actions');
    const startCustomBtn = document.getElementById('start-custom-btn');
    const previewCustomBtn = document.getElementById('preview-custom-btn');
    const startDefaultBtn = document.getElementById('start-default-btn');
    const previewModal = document.getElementById('preview-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const previewList = document.getElementById('preview-list');

    // State
    let customQuizData = null;
    const GEMINI_API_KEY = "AIzaSyDsam8ff9YcDceKH5SOCxvd2oVZFi7uXVk"; // Provided by the environment

    // --- Core Functions ---

    const getSettings = () => ({
        randomizeQuestions: document.getElementById('randomize-questions-check').checked,
        randomizeAnswers: document.getElementById('randomize-answers-check').checked,
        prioritizeUnmastered: document.getElementById('prioritize-unmastered-check').checked,
        repeatCount: parseInt(document.getElementById('repeat-count-input').value, 10) || 3,
    });

    const navigateToQuiz = () => {
        window.location.href = 'quiz.html';
    };

    /**
     * Calls Gemini to reformat text into a simple, structured format.
     */
    const getStructuredTextFromAI = async (contentChunk) => {
        const prompt = `Từ văn bản dưới đây, hãy trích xuất các câu hỏi trắc nghiệm. Định dạng đầu ra một cách chính xác như sau:
- Bắt đầu mỗi câu hỏi bằng 'Q: '.
- Liệt kê mỗi phương án trên một dòng mới, bắt đầu bằng 'A: '.
- Với phương án đúng, hãy dùng 'A-CORRECT: '.
- Phân tách mỗi câu hỏi bằng '---'.

Ví dụ:
Q: Thủ đô của Việt Nam là gì?
A: Đà Nẵng
A-CORRECT: Hà Nội
A: TP. Hồ Chí Minh
---

Nội dung văn bản cần xử lý:
${contentChunk}`;
        
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`Lỗi API: ${response.status}`);
            const result = await response.json();
            return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (error) {
            console.error("Lỗi khi lấy văn bản có cấu trúc từ AI:", error);
            return ""; 
        }
    };

    /**
     * Parses the AI-generated structured text into a JavaScript array.
     */
    const parseStructuredTextToJSON = (structuredText) => {
        const questions = [];
        const questionBlocks = structuredText.trim().split('---');

        for (const block of questionBlocks) {
            if (!block.trim()) continue;
            const lines = block.trim().split('\n');
            const questionLine = lines.find(line => line.startsWith('Q:'));
            if (!questionLine) continue;

            const question = questionLine.substring(3).trim();
            const options = [];
            let correctAnswer = '';

            for (const line of lines) {
                if (line.startsWith('A-CORRECT:')) {
                    const answer = line.substring(10).trim();
                    correctAnswer = answer;
                    options.push(answer);
                } else if (line.startsWith('A:')) {
                    options.push(line.substring(3).trim());
                }
            }
            if (question && options.length > 1 && correctAnswer) {
                questions.push({ question, options, correctAnswer });
            }
        }
        return questions;
    };
    
    const delay = ms => new Promise(res => setTimeout(res, ms));

    /**
     * Takes full text, chunks it, and processes with AI.
     */
    const processTextWithAI = async (fullText) => {
        uploadStatus.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="loader"></div>Sử dụng AI để xử lý văn bản...</div>`;
        const cleanedContent = fullText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
        
        const questionBlocks = cleanedContent.trim().split(/\n\s*\n/);
        const CHUNK_SIZE = 20;
        const chunks = [];
        for (let i = 0; i < questionBlocks.length; i += CHUNK_SIZE) {
            chunks.push(questionBlocks.slice(i, i + CHUNK_SIZE).join('\n\n'));
        }

        try {
            let allStructuredText = "";
            for (let i = 0; i < chunks.length; i++) {
                uploadStatus.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="loader"></div>Đang xử lý phần ${i + 1}/${chunks.length}...</div>`;
                const result = await getStructuredTextFromAI(chunks[i]);
                allStructuredText += result + "\n---\n";
                await delay(250);
            }
            
            const allParsedData = parseStructuredTextToJSON(allStructuredText);

            if (allParsedData.length > 0) {
                customQuizData = allParsedData;
                localStorage.setItem('quizApp_customQuiz', JSON.stringify(customQuizData)); // Save for persistence
                updateUIForCustomQuiz();
            } else {
                throw new Error("AI không thể trích xuất câu hỏi. Vui lòng kiểm tra định dạng tệp.");
            }
        } catch (error) {
            console.error("Lỗi khi xử lý văn bản bằng AI:", error);
            uploadStatus.innerHTML = `<span class="text-red-500 font-semibold">${error.message}</span>`;
            customQuizActions.classList.add('hidden');
        }
    };

    /**
     * Reads a file from upload and sends it for processing.
     */
    const processQuizFile = (file) => {
        if (!file) return;
        customQuizActions.classList.add('hidden');
        uploadStatus.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="loader"></div>Đang đọc tệp...</div>`;

        const reader = new FileReader();

        if (file.name.toLowerCase().endsWith('.docx')) {
            if (typeof mammoth === 'undefined') {
                uploadStatus.innerHTML = `<span class="text-red-500 font-semibold">Lỗi: Thư viện mammoth.js chưa được tải.</span>`;
                return;
            }
            reader.onload = (event) => {
                mammoth.extractRawText({ arrayBuffer: event.target.result })
                    .then(result => processTextWithAI(result.value))
                    .catch(err => {
                        console.error("Lỗi xử lý .docx:", err);
                        uploadStatus.innerHTML = `<span class="text-red-500 font-semibold">Không thể đọc tệp .docx này.</span>`;
                    });
            };
            reader.readAsArrayBuffer(file);
        } else { // Fallback for .txt files
            reader.onload = (event) => processTextWithAI(event.target.result);
            reader.readAsText(file, 'UTF-8');
        }
    };

    /**
     * Updates the UI to reflect a loaded custom quiz.
     */
    function updateUIForCustomQuiz() {
        uploadStatus.innerHTML = `<span class="text-green-600 font-semibold">Đã tải ${customQuizData.length} câu hỏi. Sẵn sàng để bắt đầu!</span>`;
        customQuizActions.classList.remove('hidden');
    }

    /**
     * Checks localStorage for a previously saved custom quiz on page load.
     */
    function loadDataFromStorage() {
        const savedData = localStorage.getItem('quizApp_customQuiz');
        if (savedData) {
            try {
                customQuizData = JSON.parse(savedData);
                if (customQuizData && customQuizData.length > 0) {
                    updateUIForCustomQuiz();
                }
            } catch (e) {
                console.error("Lỗi khi đọc dữ liệu từ localStorage:", e);
                localStorage.removeItem('quizApp_customQuiz');
            }
        }
    }

    // --- Event Listeners ---
    fileUploadInput.addEventListener('change', (event) => processQuizFile(event.target.files[0]));
    
    startCustomBtn.addEventListener('click', () => {
        if (!customQuizData) return;
        localStorage.setItem('quizApp_currentQuestions', JSON.stringify(customQuizData));
        localStorage.setItem('quizApp_settings', JSON.stringify(getSettings()));
        navigateToQuiz();
    });

    startDefaultBtn.addEventListener('click', () => {
        const defaultRawData = `
Q: Tiến trình ra quyết định bao gồm mấy phần?
A: 1
A: 2
A: 3
A-CORRECT: 4
---
Q: Tiến trình ra quyết định bao gồm ?
A: Phân Tích,Thiết Kế,Lựa chọn
A-CORRECT: Phân tích, thiết kế,lựa chọn, thực thi lựa chọn
A: Phân tích, thiết kế, hành động
A: Phân tích, thiết kế
---
Q: Quyết định được xác định theo một trình tự thủ tục xác định được gọi là quyết định……
A-CORRECT: Có cấu trúc
A: Không cấu trúc
A: Bán cấu trúc
A: Không tài liệu
---
Q: Dữ liệu của Big Data là loại nào ?
A: Structured Data
A: Semi-Structured Data
A: Unstructured Data
A-CORRECT: Tất cả
---
Q: Đăc trưng nào không phải của Big Data
A: Volume
A: Variety
A-CORRECT: Vision
A: Velocity
---
Q: NoSQL là ?
A-CORRECT: Database
A: Field
A: Document
A: Collection
---
Q: Mục tiêu của NoSQL là gì?
A: NoSQL cung cấp một giải pháp thay thế cho cơ sở dữ liệu SQL để lưu trữ dữ liệu dạng văn bản.
A-CORRECT: Cơ sở dữ liệu NoSQL cho phép lưu trữ dữ liệu không có cấu trúc.
A: NoSQL không thích hợp để lưu trữ dữ liệu có cấu trúc.
A: NoSQL là một định dạng dữ liệu mới để lưu trữ các tập dữ liệu lớn.
---
Q: Cloudera phát triển công cụ nào ?
A: HCatalog
A: Hbase
A-CORRECT: Imphala
A: Oozie
---
Q: Loại nào không phải là CSDL NoSQL ?
A-CORRECT: SQL Server
A: MongoDB
A: Cassandra
A: Không có
---
Q: Đâu là một kiểu của CSDL NoSQL
A: SQL
A-CORRECT: Document databases
A: JSON
A: Tất cả
---
Q: Chọn đúng 5 đặc trưng cho Big Data ?
A-CORRECT: Volume, Velocity, Variety, Veracity, Value
A: Volume, Videos, Velocity, Variability, Value
A: Volume, Variability, Veracity, Visualization, Value
A: Volume, Velocity, Veracity, Visualization, Value
---
Q: Velocity (Tốc độ) là đặc trưng nói về?
A-CORRECT: Tốc độ gia tăng khối lượng dữ liệu lớn
A: Tốc độ cập nhật dữ liệu lớn
A: Tốc độ xử lý dữ liệu lớn
A: Tốc độ lưu trữ dữ liệu lớn
---
Q: Variety (Tính đa dạng) là đặc trưng về ?
A-CORRECT: Kiểu dữ liệu thu thập
A: Kiểu nội dung dữ liệu
A: Nguồn thu thập dữ liệu
A: Phương thức xử lý dữ liệu
---
Q: Đặc trưng quan trọng nhất của Big Data?
A: Khối lượng
A: Tính đa dạng
A: Tốc độ
A-CORRECT: Tất cả
---
Q: Đâu là đặc trưng quyết việc triển khai Dữ liệu lớn?
A: Khối lượng
A-CORRECT: Giá trị
A: Tốc Độ
A: Tính đa dạng
---
Q: Tích hợp dữ liệu là quá trình ?
A-CORRECT: Kết hợp các dữ liệu không đồng nhất từ nhiều nguồn khác nhau
A: Sao chép dữ liệu vào CSDL hệ thống để tiến hành phân tích
A: Làm sạch các dữ liệu thu thập được từ các hệ thống thành phần
A: Tăng giá trị từ các tài nguyên dữ liệu đang lưu trữ phân tán
---
Q: Thuật ngữ Dữ liệu lớn ra đời năm nào?
A-CORRECT: 1997
A: 2000
A: 1998
A: 1941
---
Q: Các dạng thức khoa học dữ liệu của Jim Gray?
A: Thực nghiệm
A: Lý thuyết
A: Tính toán
A-CORRECT: Tất cả các ý
---
Q: Phát biểu nào không phải dạng thức nghiên cứu Khoa học dữ liệu của Jim Gray?
A-CORRECT: Khai thác dữ liệu
A: Mô phỏng
A: Tính toán
A: Thực nghiệm
---
Q: Đâu không phải là phương thức xử lý dữ liệu lớn?
A: Thu thập (acquire)
A-CORRECT: Đánh giá (reviews)
A: Tổ chức (organize)
A: Phân tích (analyze)
---
Q: RDBMS là gì ?
A-CORRECT: Relational Database Management System
A: Relat Data Management System
A: Relational Database Microsoft System
A: Tất cả
---
Q: Thị trường Big Data bao gồm:
A: Phần cứng
A: Phần Mềm
A-CORRECT: Tất cả
A: Dịch vụ
---
Q: Nhược điểm của tích hợp dữ liệu theo phương pháp Tight Coupling
A: Độ trễ
A: Phản hồi truy vấn
A: Phụ thuộc vào nguồn dữ liệu
A-CORRECT: Tất cả
---
Q: Nhược điểm của tích hợp dữ liệu theo phương pháp Loose Coupling
A-CORRECT: Tất cả
A: Chi phí cao
A: Độ trễ
A: Phụ thuộc mạng / băng thông
---
Q: Công cụ nào hỗ trợ tốt NoSQL?
A: SAP Data Services
A: Oracle Data Integrator
A: SQL Server Integration Services
A-CORRECT: Tất cả
---
Q: Công cụ tích hợp dữ liệu Boomi là của?
A-CORRECT: Dell
A: IBM
A: Microsoft
A: SAP
---
Q: Công cụ SQL Server Integrator do ai phát triển ?
A: Oracle
A: IBM
A-CORRECT: Microsoft
A: SAP
---
Q: SAP Data Service là công cụ để làm gì ?
A: Lưu trữ dữ liệu
A-CORRECT: Tích hợp dữ liệu
A: Phân tích dữ liệu
A: Tất cả
---
Q: Hệ quản trị CSLD DynamoDB là kiểu nào ?
A-CORRECT: Key value
A: Wide Column based
A: Document based
A: Graph based
---
Q: Hệ quản trị CSLD MongoDB là kiểu nào ?
A-CORRECT: Document based
A: Key value
A: Wide Column based
A: Graph based
---
Q: Hệ quản trị CSLD Neo4J là kiểu nào ?
A: Key value
A: Wide Column based
A: Document based
A-CORRECT: Graph based
---
Q: Hệ quản trị CSLD IBM Graph là kiểu nào ?
A: Key value
A: Document based
A-CORRECT: Graph based
A: Wide Column based
---
Q: Hệ quản trị CSLD Google Big Table là kiểu nào ?
A: Key value
A-CORRECT: Wide Column based
A: Document based
A: Graph based
---
Q: Đâu không phải là RDBMS ?
A: IBM DB2
A: MS SQL Server
A: MS Access
A-CORRECT: Cassandra
---
Q: Loại nào là dữ liệu Bán cấu trúc ?
A-CORRECT: Tất cả
A: JSON
A: CSV
A: XML
---
Q: Loại nào là dữ liệu Unstructured ?
A-CORRECT: Video
A: XML
A: Table
A: Tất cả
---
Q: Yếu tố nào quyết định để sử dụng NoSQL
A: Tốc độ gia tăng CSDL
A: Tính đa dạng của dữ liệu
A: Tốc độ truy cập dữ liệu
A-CORRECT: Tất cả
---
Q: CSDL nào không phải kiểu Key-Value:
A-CORRECT: MongoDB
A: DynamoDB
A: Redis
A: Riak
---
Q: CSDL nào không phải kiểu Document:
A: MongoDB
A: CouchDB
A: Elasticsearch
A-CORRECT: Riak
---
Q: CSDL nào không phải kiểu Graph:
A: InfoGrid
A-CORRECT: Hbase
A: InfiniteGraph
A: IBM Graph
---
Q: CSDL nào không phải kiểu Wide-Column:
A: Hbase
A: Cassandra
A: BigTable
A-CORRECT: Dex
---
Q: Ưu điểm của hệ thống HDFS là gì ?
A-CORRECT: Lưu trữ phân tán, xử lý song song, khả năng chịu lỗi cao
A: Lưu trữ song song, xử lý phân tán, tính sẵn sàng cao
A: Xử lý phân tán song song, khả năng chịu lỗi chấp nhận sai sót
A: Tất cả
---
Q: Ưu điểm của DFS là gì ?
A: Hệ thống lưu trữ song song nên tránh được ảnh hưởng khi một máy chủ hoặc bộ nhớ bị lỗi
A: Hệ thống được sao lưu tại Server thứ hai nên đảm bảo việc cung cấp dữ liệu
A-CORRECT: Khi một máy chủ hoặc bộ nhớ bị lỗi, hệ thống tệp phân tán vẫn đảm bảo có thể cung cấp dữ liệu ổn định
A: Tất cả
---
Q: Ưu điểm của công nghệ Cluster
A-CORRECT: Tất cả
A: Hiệu quả chi phí
A: TÍnh sẵn sàng cao
A: Khả năng mở rộng linh hoạt
---
Q: Cluster node có mấy loại ?
A: 1
A-CORRECT: 2
A: 3
A: 4
---
Q: Nguồn của kiến trúc HDFS trong Hadoop có nguồn gốc là
A-CORRECT: Hệ thống tệp phân phối của Google
A: Hệ thống tệp phân tán của Yahoo
A: Hệ thống tệp phân tán của Facebook
A: Hệ thống tệp phân tán Azure
---
Q: Loại dữ liệu mà Hadoop có thể xử lý là
A: Structred (Có cấu trúc)
A: Semi-structured (Bán cấu trúc)
A: Unstructured (Không có cấu trúc)
A-CORRECT: All of the above (Tất cả những điều trên)
---
Q: YARN là viết tắt của
A: Yahoo’s another resource name
A-CORRECT: Yet another resource negotiator
A: Yahoo’s archived Resource names
A: Yet another resource need.
---
Q: Điều nào sau đây không phải là mục tiêu của HDFS?
A: Phát hiện lỗi và khôi phục
A: Xử lý tập dữ liệu khổng lồ
A-CORRECT: Ngăn chặn việc xóa dữ liệu
A: Cung cấp băng thông mạng cao để di chuyển dữ liệu
---
Q: Trong HDFS, các tệp không thể
A: Đọc
A: Xóa
A-CORRECT: Thực thi
A: Lưu trữ
---
Q: So với RDBMS, Hadoop
A: Có tính toàn vẹn dữ liệu cao hơn.
A: Có giao dịch ACID không
A: Thích hợp để đọc và truy vấn nhanh
A-CORRECT: Hoạt động tốt hơn trên dữ liệu phi cấu trúc và bán cấu trúc .
---
Q: Vấn đề chính gặp phải khi đọc và ghi dữ liệu song song từ nhiều đĩa là gì?
A: Xử lý khối lượng lớn dữ liệu nhanh hơn.
A-CORRECT: Kết hợp dữ liệu từ nhiều đĩa.
A: Phần mềm cần thiết để thực hiện nhiệm vụ này là cực kỳ tốn kém.
A: Phần cứng cần thiết để thực hiện tác vụ này là cực kỳ tốn kém.
---
Q: Tính năng định vị dữ liệu trong Hadoop có nghĩa là
A: lưu trữ cùng một dữ liệu trên nhiều nút.
A: chuyển vị trí dữ liệu từ nút này sang nút khác.
A-CORRECT: đồng định vị dữ liệu với các nút tính toán.
A: Phân phối dữ liệu trên nhiều nút.
---
Q: Các tệp HDFS được thiết kế cho
A: Nhiều người viết và sửa đổi ở các hiệu số tùy ý.
A: Chỉ nối vào cuối tệp.
A-CORRECT: Chỉ ghi thành tệp một lần.
A: Truy cập dữ liệu có độ trễ thấp.
---
Q: Hệ thống Apache Hadoop được viết bằng ngôn ngữ nào?
A: C ++
A: Python
A-CORRECT: Java
A: Go
---
Q: Cái nào không phải là một trong đặc trưng 3Vs của dữ liệu lớn?
A: Vận tốc - Velocity
A-CORRECT: Tính xác thực - Veracity
A: Khối lượng - Volume
A: Đa dạng - Variety
---
Q: Điều nào sau đây đúng đối với Hadoop?
A: Đây là một khung phân tán.
A: Thuật toán chính được sử dụng trong đó là Map Reduce.
A: Nó chạy có thể thực thi trên hạ tầng Cloud Computing.
A-CORRECT: Tất cả đều đúng
---
Q: Loại nào sau đây lưu trữ dữ liệu?
A: Name node
A-CORRECT: Data node
A: Master node
A: Không có
---
Q: Node nào sau đây quản lý các nút khác?
A-CORRECT: Name node
A: Data node
A: Slave node
A: Tất cả
---
Q: Hadoop xử lý khối lượng lớn dữ liệu như thế nào?
A: Hadoop sử dụng song song rất nhiều máy. Điều này tối ưu hóa việc xử lý dữ liệu.
A: Hadoop được thiết kế đặc biệt để xử lý lượng lớn dữ liệu bằng cách tận dụng phần cứng MPP.
A-CORRECT: Hadoop gửi mã đến dữ liệu thay vì gửi dữ liệu đến mã.
A: Hadoop sử dụng các kỹ thuật bộ nhớ đệm phức tạp trên NameNode để tăng tốc độ xử lý dữ liệu.
---
Q: MapReduce do công ty nào phát triển ?
A: Apache
A-CORRECT: Google
A: IBM
A: Amazon
---
Q: Dịch vụ đám mây nào hỗ trợ tốt cho Big Data ?
A: Amazon AWS
A: Google Cloud
A-CORRECT: Tất cả
A: Microsoft Azure
---
Q: Nhược điểm khi triển khai Big Data trên nền tảng Cloud Computing là?
A: Nhiều rủi ro cho hệ thống
A-CORRECT: Không có ý đúng
A: Tốc độ xử lý không đảm bảo
A: Phân tích theo thời gian thực kém
---
Q: Mô hình Điện toán đám mây IaaS ?
A-CORRECT: Cơ sở hạ tầng dưới dạng dịch vụ
A: Nền tảng dưới dạng dịch vụ
A: Phần mềm dưới dạng dịch vụ
A: Internet dưới dạng dịch vụ
---
Q: Mô hình Điện toán đám mây PaaS ?
A: Cơ sở hạ tầng dưới dạng dịch vụ
A-CORRECT: Nền tảng dưới dạng dịch vụ
A: Phần mềm dưới dạng dịch vụ
A: Internet dưới dạng dịch vụ
---
Q: Mô hình Điện toán đám mây SaaS ?
A: Cơ sở hạ tầng dưới dạng dịch vụ
A: Nền tảng dưới dạng dịch vụ
A-CORRECT: Phần mềm dưới dạng dịch vụ
A: Internet dưới dạng dịch vụ
---
Q: Lợi ích của Cloud Computing với Big Data là ?
A: Triển khai hạ tầng nhanh chóng
A: Phân tích theo thời gian thực
A: Tối ưu chi phí duy trì hoạt động
A-CORRECT: Tất cả
---
Q: Lợi ích vượt trội của Cloud Computing với Big Data là ?
A: Hạn chế đầu tư máy móc
A-CORRECT: Phân tích theo thời gian thực
A: Tối ưu chi phí duy trì hoạt động
A: Tất cả
---
Q: Dịch vụ lưu trữ dữ của Amazon – AWS là?
A-CORRECT: Amazon S3
A: Amazon RDS
A: Amazon Lambda
A: EC2
---
Q: Dịch vụ lưu trữ của Microsoft Azure là ?
A: Virtual Machines
A: Azure Function
A-CORRECT: Azure Disk Storage
A: Azure Cosmos DB
---
Q: Dịch vụ lưu trữ của Google Cloud Platfom là?
A: Google Driver
A: Goolge Functions
A-CORRECT: Google Cloud Storage
A: Google Cloud Datastore
---
Q: Đám mây AWS cung cấp dịch vụ NoSQL Database
A: Amazon RDS
A: Amazon EC2
A-CORRECT: Amazon DynamoDB
A: Amazon Container Service
---
Q: Đám mây Microsoft Azure cung cấp dịch vụ NoSQL Database
A-CORRECT: Table Storage
A: SQL DB
A: Azure Functions
A: Cloud Service
---
Q: Dịch vụ tích hợp dữ liệu trên đám mây trên Google Cloud Platform
A: Google Cloud Dataprep
A-CORRECT: Google Cloud Data Fusion
A: Google Data Catalog
A: Google BigQuery
---
Q: Dịch vụ thông minh giúp khái phá, làm sạch dữ liệu trên Google Cloud Platform
A: Goolge Functions
A: Google BigQuery
A-CORRECT: Google Cloud Dataprep
A: Google Data Catalog
---
Q: Trên Google Cloud Platform dịch vụ nào quản lý CSDL NoQuery
A: Google Cloud Dataprep
A: Google Data Catalog
A: Google BigQuery
A-CORRECT: Cloud Bigtable
---
Q: Trên Google Cloud Platform dịch vụ nào quản lý danh mục dữ liệu
A-CORRECT: Google Data Catalog
A: Google Cloud Dataprep
A: Google Data Catalog
A: Google BigQuery
---
Q: Trên Google Cloud Platform dịch vụ phân tích dữ liệu được cung cấp
A: Google Data Catalog
A-CORRECT: Google BigQuery
A: Google Cloud Dataprep
A: Goolge Functions
---
Q: Nền tảng Cloudera hỗ trợ hệ CSDL quan hệ nào?
A: MySQL
A: Oracle
A: PostgreSQL
A-CORRECT: Tất cả
---
Q: Hệ CSDL NoSQL trên nền tảng Cloudera là ?
A-CORRECT: Apache Accumulo
A: DynamoDB
A: AppEngine Datastore
A: Table Storage
---
Q: Dich vụ phân tích dữ liệu lớn Cloudera cung cấp là?
A-CORRECT: Hadoop
A: BigQuery
A: Elastic MapReduce
A: Không có
---
Q: Cloudera Enterprise có thể được triển khai trên đám mây nào
A: Google Cloud
A: Amazon AWS
A-CORRECT: Tất cả
A: Microsoft Azure
---
Q: Công cụ trên Google Cloud Platform chuyển đổi dữ liệu hỗ trợ quyết định
A: Google Cloud
A: Google Data Catalog
A-CORRECT: Google Data Studio
A: Goolge Functions
---
Q: Mô hình chính dành cho Điện toán đám mây ?
A: Cơ sở hạ tầng dưới dạng dịch vụ (IaaS)
A-CORRECT: Tất cả
A: Nền tảng dưới dạng dịch vụ (PaaS)
A: Phần mềm dưới dạng dịch vụ (SaaS)
---
Q: Kiểu phân tích dữ liệu nào cho ta biết điều gì đã xảy ra ?
A-CORRECT: Descriptive Analysis
A: Diagnostic Analysis
A: Predictive Analysis
A: Prescriptive Analysis
---
Q: Kiểu phân tích dữ liệu nào chuẩn đoán lý do cho kết quả ?
A: Descriptive Analysis
A-CORRECT: Diagnostic Analysis
A: Predictive Analysis
A: Prescriptive Analysis
---
Q: Kiểu phân tích dữ liệu nào dự đoán điều sẽ xảy ra ?
A: Descriptive Analysis
A: Diagnostic Analysis
A-CORRECT: Predictive Analysis
A: Prescriptive Analysis
---
Q: Kiểu phân tích nào để hỗ trợ đưa ra quyết định ?
A: Descriptive Analysis
A: Diagnostic Analysis
A: Predictive Analysis
A-CORRECT: Prescriptive Analysis
---
Q: Loại phân tích dữ liệu nào kết quả thu được cho ta biết điều gì đã xảy ra ?
A-CORRECT: Phân tích mô tả
A: Phân tích chuẩn đoán
A: Phân tích dự đoán
A: Phân tích đề xuất
---
Q: Loại phân tích dữ liệu nào kết quả thu được cho ta biết tại sao điều đó xảy ra ?
A: Phân tích mô tả
A-CORRECT: Phân tích chuẩn đoán
A: Phân tích dự đoán
A: Phân tích đề xuất
---
Q: Loại phân tích dữ liệu nào kết quả thu được cho ta biết điều gì sẽ xảy ra ?
A: Phân tích mô tả
A: Phân tích chuẩn đoán
A-CORRECT: Phân tích dự đoán
A: Phân tích đề xuất
---
Q: Loại phân tích dữ liệu nào kết quả thu được cho ta biết làm thể nào để nó xảy ra
A: Phân tích mô tả
A: Phân tích chuẩn đoán
A: Phân tích dự đoán
A-CORRECT: Phân tích đề xuất
---
Q: Mục tiêu đúng nhất của phân tích dữ liệu lớn là gì ?
A-CORRECT: Biến dữ liệu thành thông tin chi tiết hữu ích
A: Sắp xếp dữ liệu có ích để sử dụng
A: Tạo ra các dữ liệu phù hợp nhất với hệ thống
A: Xây dựng hệ thống để quản lý dữ liệu lớn
---
Q: Hoạt động của Map Reduce bao gồm:
A: Trộn & sắp xếp - Map - Reduce
A-CORRECT: Map - Trộn & sắp xếp – Reduce
A: Reduce - Map - Trộn & sắp xếp
A: Sắp xếp - Trộn & Map – Reduce
---
Q: Phân tích chuẩn đoán sử dụng kỹ thuật nào ?
A: Lấy mẫu dữ liệu
A: Tương quan phân bổ
A: Thu tập dữ liệu
A-CORRECT: Khai phá dữ liệu
---
Q: Phân tích mô tả không phù hợp sử dụng để ?
A: Xây dựng các báo cáo
A: Lập bảng số liệu truyền thông
A: Mô hình hoá dữ liệu quá khứ
A-CORRECT: Phân tích tương quan
---
Q: Đâu là phân tích chuẩn đoán ?
A: Mô tả tương quan dữ liệu
A-CORRECT: Cung cấp cái nhinh sâu sắc về vấn đề
A: Phân tích sự bất thường từ dữ liệu lưu trữ
A: Mô hình hoá dữ liệu theo điều kiện
---
Q: Trong MapReduce loại nào sau đây theo dõi quá trình tiêu thụ tài nguyên trên Cluster Node?
A: Name node
A-CORRECT: Master node
A: Single Master
A: Slave node
---
Q: Trong MapReduce loại nào sau đây thực thi các tác vụ và cung cấp thông tin trạng thai tác vụ?
A: Name node
A: Master node
A: Single Master
A-CORRECT: Slave node
---
Q: Trong MapReduce loại nào sau đây được cung cấp task-status?
A: Name node
A-CORRECT: JobTracker
A: Single Master
A: Slave node
---
Q: Mô hình MapReduce có thể chạy trên số lượng máy chủ?
A: Vài máy
A-CORRECT: Hàng nghìn máy
A: Hàng trăm máy
A: Một máy chủ Master
---
Q: Mô hình MapReduce thuộc lớp nào ?
A: Lớp lưu trữ dữ liệu
A: Lớp thu thập dữ liệu
A-CORRECT: Lớp xử lý dữ liệu
A: Lớp phân tích dữ liệu
---
Q: Lợi ích từ Phân tích dữ liệu lớn là ?
A-CORRECT: Tất cả
A: Ra quyết định nhanh hơn, tốt hơn
A: Giảm chi phí và tăng hiệu quả hoạt động
A: Cải tiến theo định hướng dữ liệu cho thị trường
---
Q: Các ứng dụng phân tích dữ liệu lớn cho Lĩnh vực bán lẻ
A: Dự đoán hành vi mua sắm của khách hàng
A: Xây dựng mô hình chi tiêu cho từng khách hàng
A: Phân tích hành trình của khách hàng
A-CORRECT: Tất cả
---
Q: Ứng dụng phân tích dữ liệu lớn hỗ trợ ngành Y tế
A: Tăng việc khai thác tối ưu hoá máy móc
A: Tăng doanh thu từ phần mềm y tế
A-CORRECT: Tăng tinh chính xác của chẩn đoán
A: Tất cả
---
Q: Trong kiến trúc Apache Hadoop HDFS thuộc
A-CORRECT: Lớp lưu trữ
A: Lớp truyền tải
A: Lớp quản lý tài nguyên
A: Lớp xử lý dữ liệu
---
Q: Trong kiến trúc Apache Hadoop YARN là
A: Lớp lưu trữ
A: Lớp truyền tải
A-CORRECT: Lớp quản lý tài nguyên
A: Lớp xử lý dữ liệu
---
Q: Trong kiến trúc Apache Hadoop MapReduce là
A: Lớp lưu trữ
A: Lớp truyền tải
A: Lớp quản lý tài nguyên
A-CORRECT: Lớp xử lý dữ liệu
---
Q: Kiến trúc Hadoop hỗ trợ những ngôn ngữ nào
A: Java
A-CORRECT: Tất cả
A: C++
A: Python
---
Q: Spark được Apache Software Foundation phát triển từ năm nào
A: 1993
A-CORRECT: 2013
A: 2009
A: 2007
---
Q: Apache Kafka là công cụ hỗ trợ ?
A: Xử lý phân tán
A: Lưu trữ phân tán
A: Hệ quản trị CSDL
A-CORRECT: Thu tập dữ liệu
---
Q: Apache Storm là công cụ hỗ trợ?
A-CORRECT: Xử lý phân tán
A: Lưu trữ phân tán
A: Phân tích dữ liệu
A: Thu tập dữ liệu
---
Q: Đâu không phải là chế độ hoạt động của Hadoop?
A: Chế độ phân phối giả
A-CORRECT: Chế độ phân phối toàn cầu
A: Chế độ độc lập
A: Chế độ phân phối hoàn toàn
---
Q: Các tệp HDFS được thiết kế cho
A: Nhiều người viết và sửa đổi ở các hiệu số tùy ý.
A: Chỉ nối vào cuối tệp
A-CORRECT: Chỉ ghi thành tệp một lần.
A: Truy cập dữ liệu có độ trễ thấp.
---
Q: Tính năng định vị dữ liệu trong Hadoop có nghĩa là
A: Lưu trữ cùng một dữ liệu trên nhiều nút.
A: Chuyển vị trí dữ liệu từ nút này sang nút khác.
A-CORRECT: Đồng định vị dữ liệu với các nút tính toán.
A: Phân phối dữ liệu trên nhiều nút.
---
Q: Khó khăn khi đọc và ghi dữ liệu song song từ nhiều nguồn là gì?
A: Xử lý khối lượng lớn dữ liệu nhanh hơn.
A-CORRECT: Kết hợp dữ liệu từ nhiều nguồn.
A: Phần mềm cần thiết để thực hiện nhiệm vụ này là cực kỳ tốn kém.
A: Phần cứng cần thiết để thực hiện tác vụ này là cực kỳ tốn kém.
---
Q: So với RDBMS, Hadoop
A: Có tính toàn vẹn dữ liệu cao hơn.
A: Có giao dịch ACID không
A: Nó thích hợp để đọc và viết nhiều lần
A-CORRECT: Hoạt động tốt hơn trên dữ liệu phi cấu trúc và bán cấu trúc.
---
Q: Yếu tố giới hạn hiện tại đối với kích thước của một cụm hadoop là
A: Nhiệt lượng dư thừa tạo ra trong trung tâm dữ liệu
A: Giới hạn trên của băng thông mạng
A-CORRECT: Giới hạn trên của RAM trong NameNode
A: 4000 datanode
---
Q: Trong HDFS, các tệp không thể
A: Đọc
A: Xoá
A-CORRECT: Thực thi
A: Lưu trữ
---
Q: Điều nào sau đây không phải là mục tiêu của HDFS?
A: Phát hiện lỗi và khôi phục
A: Xử lý tập dữ liệu khổng lồ
A-CORRECT: Ngăn chặn việc xóa dữ liệu
A: Cung cấp băng thông mạng cao để di chuyển dữ liệu
---
Q: YARN là viết tắt của
A: Yahoo’s another resource name
A-CORRECT: Yet another resource negotiator
A: Yahoo’s archived Resource names
A: Yet another resource need.
---
Q: Kiến trúc HDFS trong Hadoop có nguồn gốc là
A-CORRECT: Hệ thống tệp phân phối của Google
A: Hệ thống tệp phân tán của Yahoo
A: Hệ thống tệp phân tán của Facebook
A: Hệ thống tệp phân tán của Azure
---
Q: HDFS là viết tắt của
A: Hệ thống tệp phân tán cao. (Highly distributed file system.)
A: Hệ thống tệp được hướng dẫn Hadoop. (Hadoop directed file system)
A: Hệ tệp phân tán cao. (Highly distributed file shell)
A-CORRECT: Hệ thống tệp phân tán Hadoop. (Hadoop distributed file system)
---
Q: Thành phân nào không thuộc Hadoop?
A: YARN
A: HDFS
A: MapReduce
A-CORRECT: GFS
---
Q: Thành phần chính của hệ thống Hadoop là ?
A: MapReduce
A: HDFS
A: YARN
A-CORRECT: Tất cả
---
Q: Apache Kafka là nền tảng mở được phát triển bởi ?
A-CORRECT: Linkedln
A: Facebook
A: Google
A: IBM
---
Q: Công cụ nào hỗ trợ tích hợp dữ liệu
A: Dell Boomi
A: Snaplogic
A: SAP Data Services
A-CORRECT: Tất cả
`;
        const simpleParse = (rawData) => {
            const questions = [];
            const questionBlocks = rawData.trim().split('---');

            for (const block of questionBlocks) {
                if (!block.trim()) continue;

                const lines = block.trim().split('\n');
                const questionLine = lines.find(line => line.startsWith('Q:'));
                if (!questionLine) continue;

                const question = questionLine.substring(3).trim();
                const options = [];
                let correctAnswer = '';

                for (const line of lines) {
                    if (line.startsWith('A-CORRECT:')) {
                        const answer = line.substring(10).trim();
                        correctAnswer = answer;
                        options.push(answer);
                    } else if (line.startsWith('A:')) {
                        options.push(line.substring(3).trim());
                    }
                }
                if (question && options.length > 1 && correctAnswer) {
                    // Ensure the correct answer is always in the options list
                    if (!options.includes(correctAnswer)) {
                       options.push(correctAnswer);
                    }
                    questions.push({ question, options, correctAnswer });
                }
            }
            return questions;
        };
        localStorage.setItem('quizApp_currentQuestions', JSON.stringify(simpleParse(defaultRawData)));
        localStorage.setItem('quizApp_settings', JSON.stringify(getSettings()));
        navigateToQuiz();
    });

    // Preview Modal Listeners
    previewCustomBtn.addEventListener('click', () => {
        if (!customQuizData) return;
        previewList.innerHTML = ''; // Clear previous content
        customQuizData.forEach((q, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'question-item';
            
            const questionTitle = document.createElement('h4');
            questionTitle.textContent = `${index + 1}. ${q.question}`;
            
            const optionsList = document.createElement('ul');
            q.options.forEach(opt => {
                const optionItem = document.createElement('li');
                optionItem.textContent = opt;
                if(opt === q.correctAnswer) {
                    optionItem.className = 'correct-answer';
                }
                optionsList.appendChild(optionItem);
            });
            
            itemDiv.appendChild(questionTitle);
            itemDiv.appendChild(optionsList);
            previewList.appendChild(itemDiv);
        });
        previewModal.classList.remove('hidden');
    });

    modalCloseBtn.addEventListener('click', () => previewModal.classList.add('hidden'));

    // --- Initial Load ---
    loadDataFromStorage();
});
