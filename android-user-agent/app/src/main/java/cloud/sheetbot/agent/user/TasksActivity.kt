package cloud.sheetbot.agent.user

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import cloud.sheetbot.agent.user.databinding.ActivityTasksBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 📋 스마트 통합 할 일 허브(Task Hub) 모바일 전용 액티비티
 * - 통화 녹음, 부재중 전화, 간편 주문 지연 등 AI가 추출한 비즈니스 후속 과업을 모바일 앱에서 직접 관리
 */
class TasksActivity : AppCompatActivity() {

    private lateinit var binding: ActivityTasksBinding
    private lateinit var adapter: TaskAdapter
    private var allTasks = listOf<TaskItemDto>()
    private var currentFilter = "PENDING" // PENDING, DONE, ALL
    private var userEmail: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTasksBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = PreferencesManager(this)
        userEmail = prefs.userEmail ?: ""

        setupToolbar()
        setupRecyclerView()
        setupFilters()

        if (userEmail.isBlank()) {
            Toast.makeText(this, "시트봇 계정 연동(로그인)이 필요합니다.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        loadTasks()
    }

    private fun setupToolbar() {
        binding.btnBack.setOnClickListener { finish() }

        binding.btnRefreshTasks.setOnClickListener {
            loadTasks()
        }

        binding.btnOpenWebTasks.setOnClickListener {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://sheetbot.cloud/tasks"))
            startActivity(intent)
        }

        binding.btnAddNewTask.setOnClickListener {
            showAddTaskDialog()
        }
    }

    private fun setupRecyclerView() {
        adapter = TaskAdapter(
            onToggleStatus = { task ->
                val nextStatus = if (task.status == "DONE") "PENDING" else "DONE"
                toggleTask(task.id, nextStatus)
            },
            onCallClick = { phone ->
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                startActivity(dialIntent)
            }
        )
        binding.rvTasksList.layoutManager = LinearLayoutManager(this)
        binding.rvTasksList.adapter = adapter
    }

    private fun setupFilters() {
        binding.tabPending.setOnClickListener {
            currentFilter = "PENDING"
            updateFilterUi()
            applyFilter()
        }
        binding.tabDone.setOnClickListener {
            currentFilter = "DONE"
            updateFilterUi()
            applyFilter()
        }
        binding.tabAll.setOnClickListener {
            currentFilter = "ALL"
            updateFilterUi()
            applyFilter()
        }

        binding.cardFilterPending.setOnClickListener {
            currentFilter = "PENDING"
            updateFilterUi()
            applyFilter()
        }
        binding.cardFilterUrgent.setOnClickListener {
            currentFilter = "PENDING"
            updateFilterUi()
            applyFilter()
        }
        binding.cardFilterDone.setOnClickListener {
            currentFilter = "DONE"
            updateFilterUi()
            applyFilter()
        }
    }

    private fun updateFilterUi() {
        binding.tabPending.setBackgroundColor(if (currentFilter == "PENDING") Color.parseColor("#059669") else Color.parseColor("#1E293B"))
        binding.tabDone.setBackgroundColor(if (currentFilter == "DONE") Color.parseColor("#059669") else Color.parseColor("#1E293B"))
        binding.tabAll.setBackgroundColor(if (currentFilter == "ALL") Color.parseColor("#059669") else Color.parseColor("#1E293B"))
    }

    private fun loadTasks() {
        binding.pbLoadingTasks.visibility = View.VISIBLE
        binding.llEmptyTasks.visibility = View.GONE

        CoroutineScope(Dispatchers.IO).launch {
            val result = ApiClient.fetchTasks(userEmail, "ALL")

            withContext(Dispatchers.Main) {
                binding.pbLoadingTasks.visibility = View.GONE
                if (result.success) {
                    allTasks = result.tasks
                    val pendingCount = allTasks.count { it.status == "PENDING" }
                    val doneCount = allTasks.count { it.status == "DONE" }
                    val urgentCount = allTasks.count { it.status == "PENDING" && (it.priority.contains("URGENT") || it.priority.contains("HIGH")) }

                    binding.tvStatPendingCount.text = pendingCount.toString()
                    binding.tvStatDoneCount.text = doneCount.toString()
                    binding.tvStatUrgentCount.text = urgentCount.toString()

                    applyFilter()
                } else {
                    Toast.makeText(this@TasksActivity, result.error ?: "할 일 목록을 불러오지 못했습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun applyFilter() {
        val filtered = when (currentFilter) {
            "PENDING" -> allTasks.filter { it.status == "PENDING" }
            "DONE" -> allTasks.filter { it.status == "DONE" }
            else -> allTasks
        }
        adapter.submitList(filtered)
        binding.llEmptyTasks.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun toggleTask(taskId: Long, nextStatus: String) {
        // 낙관적 UI 업데이트
        allTasks = allTasks.map {
            if (it.id == taskId) it.copy(status = nextStatus) else it
        }
        applyFilter()

        CoroutineScope(Dispatchers.IO).launch {
            ApiClient.toggleTaskStatus(userEmail, taskId, nextStatus)
        }
    }

    private fun showAddTaskDialog() {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("새로운 할 일 등록")

        val view = LayoutInflater.from(this).inflate(android.R.layout.simple_list_item_1, null)
        val input = EditText(this)
        input.hint = "할 일 내용을 입력하세요 (예: 견적서 수정본 송부)"
        input.setPadding(32, 24, 32, 24)
        builder.setView(input)

        builder.setPositiveButton("등록") { _, _ ->
            val text = input.text.toString().trim()
            if (text.isNotBlank()) {
                binding.pbLoadingTasks.visibility = View.VISIBLE
                CoroutineScope(Dispatchers.IO).launch {
                    val ok = ApiClient.createTask(userEmail, text, badgeText = "모바일 등록")
                    withContext(Dispatchers.Main) {
                        if (ok) {
                            Toast.makeText(this@TasksActivity, "할 일이 등록되었습니다.", Toast.LENGTH_SHORT).show()
                            loadTasks()
                        } else {
                            binding.pbLoadingTasks.visibility = View.GONE
                            Toast.makeText(this@TasksActivity, "할 일 등록에 실패했습니다.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        }
        builder.setNegativeButton("취소", null)
        builder.show()
    }
}

/**
 * RecyclerView 어댑터
 */
class TaskAdapter(
    private val onToggleStatus: (TaskItemDto) -> Unit,
    private val onCallClick: (String) -> Unit
) : RecyclerView.Adapter<TaskAdapter.ViewHolder>() {

    private var items = listOf<TaskItemDto>()

    fun submitList(newItems: List<TaskItemDto>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_task_row, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val btnCheck: ImageView = itemView.findViewById(R.id.btnTaskCheck)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTaskTitle)
        private val tvSourceBadge: TextView = itemView.findViewById(R.id.tvTaskSourceBadge)
        private val tvStateBadge: TextView = itemView.findViewById(R.id.tvTaskStateBadge)
        private val tvDueDate: TextView = itemView.findViewById(R.id.tvTaskDueDate)
        private val tvCustomer: TextView = itemView.findViewById(R.id.tvTaskCustomer)
        private val btnCall: TextView = itemView.findViewById(R.id.btnCallCustomer)

        fun bind(item: TaskItemDto) {
            val isDone = item.status == "DONE"

            tvTitle.text = item.title
            if (isDone) {
                tvTitle.paintFlags = tvTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                tvTitle.setTextColor(Color.GRAY)
                btnCheck.setImageResource(android.R.drawable.checkbox_on_background)
            } else {
                tvTitle.paintFlags = tvTitle.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
                tvTitle.setTextColor(Color.parseColor("#F8FAFC"))
                btnCheck.setImageResource(android.R.drawable.checkbox_off_background)
            }

            btnCheck.setOnClickListener { onToggleStatus(item) }

            // 출처 뱃지
            when (item.sourceType) {
                "CALL_RECORDING" -> {
                    tvSourceBadge.text = "🎙️ 통화 녹음"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#064E3B"))
                }
                "MISSED_CALL" -> {
                    tvSourceBadge.text = "📞 부재중 전화"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#78350F"))
                }
                "ORDER_DELAY", "ORDER" -> {
                    tvSourceBadge.text = "📦 주문 지연"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#1E3A8A"))
                }
                "KAKAO" -> {
                    tvSourceBadge.text = "💬 카카오톡"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#713F12"))
                }
                else -> {
                    tvSourceBadge.text = "📋 일반 업무"
                    tvSourceBadge.setBackgroundColor(Color.parseColor("#334155"))
                }
            }

            // 상태 뱃지
            if (!item.badgeText.isNullOrBlank()) {
                tvStateBadge.text = item.badgeText
                tvStateBadge.visibility = View.VISIBLE
                if (item.badgeText.contains("출고지연")) {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#881337"))
                } else if (item.badgeText.contains("안내요망")) {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#7C2D12"))
                } else {
                    tvStateBadge.setBackgroundColor(Color.parseColor("#0284C7"))
                }
            } else {
                tvStateBadge.visibility = View.GONE
            }

            // 기한
            if (!item.dueDate.isNullOrBlank()) {
                tvDueDate.text = item.dueDate
                tvDueDate.visibility = View.VISIBLE
            } else {
                tvDueDate.visibility = View.GONE
            }

            // 고객명
            if (!item.contactName.isNullOrBlank()) {
                tvCustomer.text = "고객: ${item.contactName}"
                tvCustomer.visibility = View.VISIBLE
            } else {
                tvCustomer.visibility = View.GONE
            }

            // 전화번호
            if (!item.contactPhone.isNullOrBlank()) {
                btnCall.text = "📞 ${item.contactPhone}"
                btnCall.visibility = View.VISIBLE
                btnCall.setOnClickListener { onCallClick(item.contactPhone) }
            } else {
                btnCall.visibility = View.GONE
            }
        }
    }
}
