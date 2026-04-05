import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { callGeminiJSON } from '@/lib/ai'

/**
 * GET /api/cron/seasonal-tasks
 *
 * Runs on the 1st of each month. Checks seasonal templates
 * and creates tasks for all active properties if the template's
 * month_trigger matches the current month.
 *
 * Protected by a secret header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const currentMonth = new Date().getMonth() + 1 // 1-12

  // Get active templates for this month
  const { data: templates } = await serviceClient
    .from('seasonal_templates')
    .select('*')
    .eq('month_trigger', currentMonth)
    .eq('is_active', true)

  if (!templates || templates.length === 0) {
    return NextResponse.json({ message: 'No templates for this month', created: 0 })
  }

  // Get all active properties
  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name')
    .eq('is_active', true)

  if (!properties || properties.length === 0) {
    return NextResponse.json({ message: 'No active properties', created: 0 })
  }

  let created = 0

  for (const template of templates) {
    const checklistItems = template.checklist_items as string[]

    for (const property of properties) {
      // Create the task
      const { data: task, error: taskError } = await serviceClient
        .from('tasks')
        .insert({
          property_id: property.id,
          title: `${template.title} — ${property.name}`,
          description: template.description,
          status: 'pending',
          priority: 'normal',
          is_seasonal: true,
          season_type: template.season_type,
          due_date: new Date(
            new Date().getFullYear(),
            currentMonth - 1,
            15 // Default to 15th of the month
          ).toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (taskError || !task) continue

      // Create template checklist items
      if (checklistItems && checklistItems.length > 0) {
        const items = checklistItems.map((label, index) => ({
          task_id: task.id,
          label,
          sort_order: index,
        }))
        await serviceClient.from('task_checklist_items').insert(items)
      }

      // AI-generated property-specific checklist items
      try {
        const { data: recentTasks } = await serviceClient
          .from('tasks')
          .select('title')
          .eq('property_id', property.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(10)

        const seasonNames: Record<string, string> = {
          rain_roof: 'winter rain/roof season',
          boiler_heating: 'winter heating season',
          ac_clean: 'summer AC season',
        }

        const aiItems = await callGeminiJSON<string[]>('fast', [
          {
            parts: [
              {
                text: `Generate 3-5 additional seasonal maintenance checklist items for a short-term rental apartment in Jerusalem.

Property: ${property.name}
Season: ${seasonNames[template.season_type] || template.season_type}
Standard items already included: ${(checklistItems || []).join(', ')}
Recent completed maintenance: ${(recentTasks ?? []).map(t => t.title).join(', ') || 'None'}

Return a JSON array of strings, each a specific actionable checklist item. Focus on items specific to Jerusalem climate and Israeli building standards. Do not repeat the standard items.`,
              },
            ],
          },
        ])

        if (aiItems && aiItems.length > 0) {
          const baseIndex = (checklistItems?.length ?? 0)
          await serviceClient.from('task_checklist_items').insert(
            aiItems.slice(0, 5).map((label, i) => ({
              task_id: task.id,
              label,
              sort_order: baseIndex + i,
              ai_generated: true,
            }))
          )
        }
      } catch {
        // AI enhancement failed — template items are sufficient
      }

      created++
    }
  }

  return NextResponse.json({
    message: `Created ${created} seasonal tasks from ${templates.length} templates`,
    created,
  })
}
