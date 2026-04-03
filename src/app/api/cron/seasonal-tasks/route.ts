import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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

      // Create checklist items for the task
      if (checklistItems && checklistItems.length > 0) {
        const items = checklistItems.map((label, index) => ({
          task_id: task.id,
          label,
          sort_order: index,
        }))

        await serviceClient.from('task_checklist_items').insert(items)
      }

      created++
    }
  }

  return NextResponse.json({
    message: `Created ${created} seasonal tasks from ${templates.length} templates`,
    created,
  })
}
